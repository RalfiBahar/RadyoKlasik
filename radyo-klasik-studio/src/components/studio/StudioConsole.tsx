"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStudioRealtime } from "@/lib/useStudio";
import { formatClock } from "@/lib/format";
import { stationNow, stationTime } from "@/lib/schedule";
import { Badge } from "@/components/ui";
import StudioPlayer from "./StudioPlayer";
import TransportControls from "./TransportControls";
import Monitor from "./Monitor";
import MicControl from "./MicControl";
import LibraryBrowser from "./LibraryBrowser";
import QueuePanel from "./QueuePanel";

export default function StudioConsole() {
  const { token } = useAuth();
  const {
    queue,
    studio,
    status,
    connected,
    schedule,
    access,
    refreshQueue,
    refreshStudio,
    refreshStatus,
  } = useStudioRealtime();
  const slot = schedule?.active ?? null;

  const [clock, setClock] = useState(0);
  const tzRef = useRef("Europe/Istanbul");
  if (schedule?.timezone) tzRef.current = schedule.timezone;

  useEffect(() => {
    const tick = () => {
      // Station time (the schedule's timezone), not the DJ's browser time.
      const now = new Date();
      const local = stationNow(tzRef.current, now);
      setClock(local.minute * 60 + now.getSeconds());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const onAir = !!studio?.onAir || status?.source === "live";
  // Once the queue has loaded, its now-playing is authoritative (pushed live via
  // queue:update on every track change AND on dead-air). A null there means the
  // deck is genuinely empty (off-air silence), so don't fall back to the slower
  // 5s status poll — that's only a bootstrap before the first queue load.
  const nowPlaying = queue
    ? queue.nowPlaying
    : status?.currentTrack
      ? {
          trackId: status.currentTrack.trackId,
          title: status.currentTrack.title,
          artist: status.currentTrack.artist,
          album: status.currentTrack.album,
          thumb: null,
          source: status.source,
          startedAt: status.currentTrack.startedAt ?? null,
        }
      : null;

  const onQueueChanged = () => refreshQueue();

  // Station air state for the top bar: a live DJ, AutoDJ/queue audio, or
  // genuine dead air (autopilot off + empty queue).
  const airLabel = onAir ? "LIVE" : nowPlaying ? "ON AIR" : "OFF AIR";
  const airClass = onAir
    ? "bg-red-600 text-white"
    : nowPlaying
      ? "bg-brand/20 text-brand"
      : "bg-ink-700 text-slate-400";
  const dotClass = onAir ? "bg-white animate-pulse" : nowPlaying ? "bg-brand" : "bg-slate-500";

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-ink-700 bg-ink-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded px-2 py-1 text-xs font-bold ${airClass}`}
            data-testid="air-state"
          >
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            {airLabel}
            {!onAir && nowPlaying && (
              <span className="font-normal opacity-80">
                · {nowPlaying.source === "request" ? "QUEUE" : "AUTODJ"}
              </span>
            )}
          </span>
          <span className="font-mono text-lg tabular-nums text-slate-200">
            {formatClock(clock)}
          </span>
          {slot && (
            <span
              className="flex items-center gap-2 rounded border border-ink-600 px-2 py-1 text-xs text-slate-300"
              data-testid="schedule-now"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: slot.color || "#f4632e" }} />
              <span className="font-semibold text-slate-100">{slot.title}</span>
              {slot.endsAt && (
                <span className="text-slate-500">
                  until {stationTime(slot.endsAt, schedule?.timezone || "Europe/Istanbul")}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Badge tone={connected ? "green" : "neutral"}>
            {connected ? "Connected" : "Reconnecting…"}
          </Badge>
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: library browser */}
        <aside className="w-72 shrink-0 border-r border-ink-700 bg-ink-800/40">
          <LibraryBrowser onQueued={onQueueChanged} />
        </aside>

        {/* Center: player + controls */}
        <section className="flex-1 space-y-4 overflow-y-auto scroll-thin p-4">
          <StudioPlayer
            nowPlaying={nowPlaying}
            onAir={onAir}
            source={status?.source ?? nowPlaying?.source}
          />

          <div className="card flex flex-wrap items-center justify-between gap-3">
            <TransportControls
              autopilot={!!status?.autopilot}
              onChanged={() => {
                refreshStatus();
                refreshQueue();
              }}
            />
            <div className="text-sm text-slate-400">
              Listeners:{" "}
              <span className="font-semibold text-slate-200">
                {status?.listeners ?? "—"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <MicControl
              studio={studio}
              token={token}
              access={access}
              onChanged={() => {
                refreshStudio();
                refreshStatus();
              }}
            />
            <Monitor />
          </div>
        </section>

        {/* Right: queue panel */}
        <aside className="w-80 shrink-0 border-l border-ink-700 bg-ink-800/40">
          <QueuePanel
            items={queue?.items ?? []}
            autodjItems={queue?.autodj?.items ?? []}
            autopilot={queue?.autodj?.enabled ?? !!status?.autopilot}
            onChanged={onQueueChanged}
          />
        </aside>
      </div>
    </div>
  );
}
