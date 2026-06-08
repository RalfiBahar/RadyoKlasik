"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStudioRealtime } from "@/lib/useStudio";
import { formatClock } from "@/lib/format";
import { Badge } from "@/components/ui";
import StudioPlayer from "./StudioPlayer";
import TransportControls, { Toggle } from "./TransportControls";
import Monitor from "./Monitor";
import MicControl from "./MicControl";
import LibraryBrowser from "./LibraryBrowser";
import QueuePanel from "./QueuePanel";

export default function StudioConsole() {
  const { token } = useAuth();
  const { queue, studio, status, connected, refreshQueue, refreshStudio, refreshStatus } =
    useStudioRealtime();

  const [lobby, setLobby] = useState(false);
  const [facebook, setFacebook] = useState(false);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
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

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-ink-700 bg-ink-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded px-2 py-1 text-xs font-bold ${
              onAir ? "bg-red-600 text-white" : "bg-ink-700 text-slate-400"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${onAir ? "bg-white" : "bg-slate-500"}`} />
            {onAir ? "ON AIR" : "OFF AIR"}
          </span>
          <span className="font-mono text-lg tabular-nums text-slate-200">
            {formatClock(clock)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Toggle label="Lobby" on={lobby} onClick={() => setLobby((v) => !v)} />
          <Toggle label="Facebook" on={facebook} onClick={() => setFacebook((v) => !v)} />
          <button
            className="text-slate-400 hover:text-slate-200"
            title="Settings (Phase 7)"
            aria-label="Settings"
          >
            ⚙
          </button>
          <Badge tone={connected ? "green" : "neutral"}>
            {connected ? "WS live" : "WS offline"}
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
          <QueuePanel items={queue?.items ?? []} onChanged={onQueueChanged} />
        </aside>
      </div>
    </div>
  );
}
