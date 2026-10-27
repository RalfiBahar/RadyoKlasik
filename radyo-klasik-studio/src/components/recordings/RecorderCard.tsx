"use client";

import { useEffect, useState } from "react";
import { getRecorder, getScheduleNow, startRecorder, stopRecorder } from "@/lib/api";
import type { ArtworkItem, RecorderStatus } from "@/lib/types";
import { formatClock } from "@/lib/format";
import { Badge, ErrorText, Field } from "@/components/ui";
import ArtworkPicker from "./ArtworkPicker";

// Record the live programme (what listeners hear) into the archive of past
// programmes shown on the website and in the app.
export default function RecorderCard({
  artworks,
  onArtworksChanged,
  onSaved,
  canManageArtwork,
}: {
  artworks: ArtworkItem[];
  onArtworksChanged: () => void;
  onSaved: () => void;
  canManageArtwork: boolean;
}) {
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [artwork, setArtwork] = useState<string | null>(null);
  const [showTitle, setShowTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Poll faster while recording; refresh the archive once a save lands.
  useEffect(() => {
    let active = true;
    let lastSaved: string | null = null;
    const tick = async () => {
      try {
        const s = await getRecorder();
        if (!active) return;
        setStatus(s);
        if (s.last?.at && s.last.at !== lastSaved) {
          if (lastSaved !== null && s.last.ok) onSaved();
          lastSaved = s.last.at;
        }
      } catch {
        // best-effort
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [onSaved]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getScheduleNow()
      .then((n) => setShowTitle(n.active ? n.active.showTitle || n.active.title : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!artwork && artworks.length) setArtwork(artworks[0].file);
  }, [artworks, artwork]);

  const recording = !!status?.recording;
  const elapsed =
    recording && status?.startedAt ? Math.floor((now - new Date(status.startedAt).getTime()) / 1000) : 0;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(
        recording
          ? await stopRecorder()
          : await startRecorder({ title: title.trim() || undefined, artist: artist.trim() || undefined, artwork })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recorder error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Recorder</div>
          <div className="text-xs text-slate-500">
            Records exactly what listeners hear. Saved programmes appear on the website and in the app.
          </div>
        </div>
        <div className="flex items-center gap-3">
          {recording ? (
            <Badge tone="red">● REC {formatClock(elapsed)}</Badge>
          ) : (
            <Badge>Idle</Badge>
          )}
          <button
            className={recording ? "btn-danger" : "btn-primary"}
            onClick={toggle}
            disabled={busy}
          >
            {recording ? "■ Stop & save" : "● Start recording"}
          </button>
        </div>
      </div>

      {recording ? (
        <p className="text-sm text-slate-300">
          Recording <span className="font-semibold text-slate-100">{status?.title}</span>
          {status?.startedBy ? ` · started by ${status.startedBy}` : ""}. It stops automatically after{" "}
          {status?.maxHours} hours.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Title" hint={showTitle ? `Defaults to the show on air: ${showTitle}` : "Defaults to “Morning Delight”"}>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={showTitle || "Morning Delight"} />
            </Field>
            <Field label="Subtitle (artist line)" hint="Defaults to “Bant Yayini (date)”">
              <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </Field>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-slate-400">Artwork</div>
            <ArtworkPicker
              items={artworks}
              selected={artwork}
              onSelect={setArtwork}
              manage={canManageArtwork}
              onChanged={onArtworksChanged}
            />
          </div>
        </>
      )}

      {status?.last && !recording && (
        <p className={`text-xs ${status.last.ok ? "text-emerald-400" : "text-red-400"}`}>
          {status.last.ok
            ? `Last recording saved: ${status.last.title} (${new Date(status.last.at).toLocaleString()})`
            : `Last recording failed: ${status.last.error}`}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
