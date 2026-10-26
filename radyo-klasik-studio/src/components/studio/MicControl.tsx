"use client";

import { useEffect, useRef, useState } from "react";
import {
  setStudioMode,
  startStudioSession,
  stopStudioSession,
} from "@/lib/api";
import { captureMic, connectIngest, type IngestControl } from "@/lib/mic";
import type { LiveAccess, StudioMode, StudioState } from "@/lib/types";
import { Toggle } from "./TransportControls";

// Mic on/off + mode (Autofeed) + gain/duck. Turning the mic ON reserves a live
// session (POST /api/v1/studio/session/start), captures the mic and bridges it
// over /ws/ingest (Phase 4). Autofeed ON = voice-over (music ducks under the
// mic); Autofeed OFF = full live takeover (music cut).
export default function MicControl({
  studio,
  token,
  access,
  onChanged,
}: {
  studio: StudioState | null;
  token: string | null;
  // Phase 7: whether this user may go live now (schedule / guest window).
  access?: LiveAccess | null;
  onChanged?: () => void;
}) {
  const active = !!studio && studio.state !== "idle";
  // The schedule (or an expired guest window) doesn't allow going live now.
  const blocked = !active && access ? !access.allowed : false;
  const [mode, setMode] = useState<StudioMode>(studio?.mode ?? "voiceover");
  const [micGain, setMicGain] = useState(1);
  const [duckLevel, setDuckLevel] = useState(0.25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local pre-air phase: asking the browser for the mic, then reserving the
  // session. Shown in the status line so a pending permission prompt is obvious.
  const [phase, setPhase] = useState<"idle" | "permission" | "connecting">("idle");
  const ingestRef = useRef<IngestControl | null>(null);
  const stoppingRef = useRef(false);

  // Keep the local mode mirror in sync with server-pushed studio:state.
  useEffect(() => {
    if (studio?.mode) setMode(studio.mode);
  }, [studio?.mode]);

  // If the session ends server-side (e.g. failback), tear down the local mic.
  useEffect(() => {
    if (!active && ingestRef.current) {
      ingestRef.current.close();
      ingestRef.current = null;
    }
  }, [active]);

  const startMic = async () => {
    if (!token) {
      setError("Not authenticated");
      return;
    }
    setBusy(true);
    setError(null);
    let sessionReserved = false;
    let stream: MediaStream | null = null;
    try {
      // Ask for the mic BEFORE reserving the live session, so a pending or
      // denied permission prompt never leaves the station half-live.
      setPhase("permission");
      try {
        stream = await captureMic();
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        throw new Error(
          name === "NotAllowedError"
            ? "Microphone access was blocked. Allow it in the browser's site settings and try again."
            : name === "NotFoundError"
              ? "No microphone found."
              : err instanceof Error
                ? err.message
                : "Could not open the microphone"
        );
      }
      setPhase("connecting");
      const session = await startStudioSession({ mode });
      sessionReserved = true;
      ingestRef.current = connectIngest({
        token,
        sessionId: session.sessionId,
        stream,
        onOpen: () => {
          ingestRef.current?.sendControl({ mode, micGain, duckLevel });
        },
        onClose: () => {
          if (!stoppingRef.current) {
            setError("Ingest connection closed");
            void stopMic({ preserveError: true });
          }
        },
        onError: () => {
          if (!stoppingRef.current) {
            setError("Ingest connection error");
            void stopMic({ preserveError: true });
          }
        },
      });
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to go live");
      stoppingRef.current = true;
      if (ingestRef.current) ingestRef.current.close();
      else stream?.getTracks().forEach((t) => t.stop());
      ingestRef.current = null;
      if (sessionReserved) {
        try {
          await stopStudioSession();
          onChanged?.();
        } catch {
          // Best-effort cleanup; surface the original startup failure.
        }
      }
      stoppingRef.current = false;
    } finally {
      setPhase("idle");
      setBusy(false);
    }
  };

  const stopMic = async ({ preserveError = false }: { preserveError?: boolean } = {}) => {
    setBusy(true);
    if (!preserveError) setError(null);
    stoppingRef.current = true;
    try {
      ingestRef.current?.close();
      ingestRef.current = null;
      await stopStudioSession();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      stoppingRef.current = false;
      setBusy(false);
    }
  };

  const toggleMic = () => (active ? stopMic() : startMic());

  // Autofeed ON = voice-over (music keeps playing, ducked); OFF = full takeover.
  const autofeedOn = mode === "voiceover";
  const toggleAutofeed = async () => {
    const next: StudioMode = autofeedOn ? "live" : "voiceover";
    setMode(next);
    if (active) {
      try {
        await setStudioMode(next);
        ingestRef.current?.sendControl({ mode: next });
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Mode switch failed");
      }
    }
  };

  const onMicGain = (v: number) => {
    setMicGain(v);
    ingestRef.current?.sendControl({ micGain: v });
  };
  const onDuck = (v: number) => {
    setDuckLevel(v);
    ingestRef.current?.sendControl({ duckLevel: v });
  };

  const micLevel = studio?.levels?.mic ?? 0;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Microphone</div>
          <div className="text-xs text-slate-500">
            {phase === "permission"
              ? "Waiting for microphone permission…"
              : active
                ? studio?.onAir
                  ? "On air"
                  : "Connecting…"
                : phase === "connecting"
                  ? "Connecting…"
                  : "Off air"}
          </div>
        </div>
        <button
          onClick={toggleMic}
          disabled={busy || blocked}
          title={blocked ? access?.reason ?? undefined : undefined}
          aria-label={active ? "Turn microphone off" : "Turn microphone on"}
          aria-pressed={active}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl transition-colors ${
            active ? "bg-red-600 text-white" : "bg-ink-700 text-slate-300 hover:bg-ink-600"
          }`}
        >
          {active ? "■" : "🎙"}
        </button>
      </div>

      {/* Mic level meter (from studio:state levels). */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Mic level</span>
          <span>{Math.round(micLevel * 100)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-ink-700">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{ width: `${Math.min(100, micLevel * 100)}%` }}
            data-testid="mic-level"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Toggle label="Autofeed" on={autofeedOn} onClick={toggleAutofeed} disabled={busy} />
        <span className="text-xs text-slate-500">
          {autofeedOn ? "Voice-over (music ducks)" : "Live takeover (music off)"}
        </span>
      </div>

      <Slider label="Mic gain" value={micGain} min={0} max={4} step={0.1} onChange={onMicGain} />
      <Slider label="Duck level" value={duckLevel} min={0} max={1} step={0.05} onChange={onDuck} />

      {blocked && access?.reason && (
        <p className="text-xs text-amber-400/90">{access.reason}</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand"
        aria-label={label}
      />
    </label>
  );
}
