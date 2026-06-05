"use client";

import { useEffect, useMemo, useState } from "react";
import { getWaveform } from "@/lib/api";
import type { WaveformJson } from "@/lib/types";

// Renders a track's waveform (Phase 1 /tracks/:id/waveform peaks) with an
// elapsed-progress overlay. Falls back to a flat placeholder while loading or
// when no track id is available (e.g. a live mic with no track marks).
export default function Waveform({
  trackId,
  progress = 0,
  bars = 96,
  live = false,
}: {
  trackId?: string | null;
  progress?: number;
  bars?: number;
  live?: boolean;
}) {
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let active = true;
    setPeaks(null);
    if (!trackId) return;
    const controller = new AbortController();
    getWaveform(trackId, controller.signal)
      .then((w: WaveformJson) => {
        if (active) setPeaks(w.peaks || []);
      })
      .catch(() => {
        if (active) setPeaks(null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [trackId]);

  // Down-sample the (up to 1000) peaks to `bars` columns.
  const columns = useMemo(() => {
    if (!peaks || peaks.length === 0) {
      // Placeholder shape.
      return Array.from({ length: bars }, (_, i) =>
        0.25 + 0.2 * Math.abs(Math.sin(i / 4))
      );
    }
    const out: number[] = [];
    const bucket = Math.max(1, Math.floor(peaks.length / bars));
    for (let i = 0; i < peaks.length; i += bucket) {
      let max = 0;
      for (let j = i; j < Math.min(i + bucket, peaks.length); j++) {
        if (peaks[j] > max) max = peaks[j];
      }
      out.push(max);
    }
    return out.slice(0, bars);
  }, [peaks, bars]);

  const playedIdx = Math.floor(columns.length * Math.min(1, Math.max(0, progress)));

  return (
    <div
      className="flex h-16 items-center gap-[2px]"
      role="img"
      aria-label="Track waveform"
      data-testid="waveform"
    >
      {columns.map((v, i) => {
        const played = i <= playedIdx;
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${
              live
                ? "animate-pulse bg-red-500/70"
                : played
                ? "bg-brand"
                : "bg-ink-600"
            }`}
            style={{ height: `${Math.max(6, v * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
