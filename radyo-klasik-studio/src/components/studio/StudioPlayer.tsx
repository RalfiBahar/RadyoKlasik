"use client";

import { useEffect, useState } from "react";
import { getTrack } from "@/lib/api";
import type { NowPlaying } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { Badge } from "@/components/ui";
import Waveform from "./Waveform";

// The Virtual Studio now-playing card: artwork, title/artist, live waveform,
// elapsed/remaining, ON AIR/source badge.
export default function StudioPlayer({
  nowPlaying,
  onAir,
  source,
}: {
  nowPlaying: NowPlaying | null;
  onAir: boolean;
  source?: string | null;
}) {
  const [duration, setDuration] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const live = source === "live" || onAir;
  const trackId = nowPlaying?.trackId ?? null;

  // Estimated mic-to-air latency (Phase A) for the talk-over cue marker.
  const airLatencyMs = Number(process.env.NEXT_PUBLIC_AIR_LATENCY_MS ?? 900);

  // Fetch the track duration when the on-air track changes.
  useEffect(() => {
    let active = true;
    setDuration(null);
    if (!trackId) return;
    getTrack(trackId)
      .then((t) => active && setDuration(t.duration ?? null))
      .catch(() => active && setDuration(null));
    return () => {
      active = false;
    };
  }, [trackId]);

  // Tick elapsed from the track's startedAt.
  useEffect(() => {
    const startedAt = nowPlaying?.startedAt
      ? new Date(nowPlaying.startedAt).getTime()
      : null;
    const compute = () => {
      if (!startedAt) {
        setElapsed(0);
        return;
      }
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [nowPlaying?.startedAt, trackId]);

  const progress = duration ? Math.min(1, elapsed / duration) : 0;
  const remaining = duration ? Math.max(0, duration - elapsed) : null;
  // Talk-over cue: where a word spoken NOW lands on the track, offset ahead of
  // the playhead by the mic-to-air latency. Only meaningful over a known track.
  const cue =
    trackId && duration && duration > 0
      ? Math.min(0.999, progress + airLatencyMs / 1000 / duration)
      : null;

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-700 text-4xl text-slate-500">
          {nowPlaying?.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={nowPlaying.thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            "♫"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {live ? (
              <Badge tone="red">● ON AIR · LIVE</Badge>
            ) : nowPlaying ? (
              <Badge tone="brand">{source || "autodj"}</Badge>
            ) : (
              <Badge tone="neutral">OFF AIR · SILENT</Badge>
            )}
          </div>
          <div className="mt-1 truncate text-xl font-bold text-slate-100">
            {nowPlaying?.title || "Nothing on air"}
          </div>
          <div className="truncate text-sm text-slate-400">
            {nowPlaying?.artist || "—"}
            {nowPlaying?.album ? ` — ${nowPlaying.album}` : ""}
          </div>
        </div>
        <div className="text-right text-sm tabular-nums text-slate-300">
          <div className="text-xs uppercase text-slate-500">Remaining</div>
          <div className="text-lg font-semibold">
            {live ? "LIVE" : remaining != null ? `-${formatDuration(remaining)}` : "--:--"}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Waveform
          trackId={trackId}
          progress={progress}
          live={live && !trackId}
          cue={cue}
        />
        <div className="mt-1 flex justify-between text-xs tabular-nums text-slate-500">
          <span>{formatDuration(elapsed)}</span>
          <span>{duration ? formatDuration(duration) : "--:--"}</span>
        </div>
        {cue != null && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-400/80">
            <span className="inline-block h-2 w-[2px] bg-amber-400/90" />
            Mic→air ≈ {(airLatencyMs / 1000).toFixed(1)}s — speak when the marker
            reaches the beat you want to hit.
          </div>
        )}
      </div>
    </div>
  );
}
