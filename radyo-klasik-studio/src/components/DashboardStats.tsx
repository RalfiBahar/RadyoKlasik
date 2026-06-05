"use client";

import { useEffect, useState } from "react";
import {
  getNowPlaying,
  getPlayoutStatus,
  type NowPlayingPublic,
} from "@/lib/api";
import type { PlayoutStatus } from "@/lib/types";
import { formatClock } from "@/lib/format";
import { Badge, StatCard, ComingSoon } from "@/components/ui";

const BROADCAST = {
  host: process.env.NEXT_PUBLIC_BROADCAST_HOST || "stream.radyoklasik.online",
  port: process.env.NEXT_PUBLIC_BROADCAST_PORT || "8005",
  mount: process.env.NEXT_PUBLIC_BROADCAST_MOUNT || "/live",
  user: process.env.NEXT_PUBLIC_BROADCAST_USER || "source",
  encoding: process.env.NEXT_PUBLIC_BROADCAST_ENCODING || "MP3 128k",
  stream: process.env.NEXT_PUBLIC_STREAM_URL || "http://localhost:8000/stream",
};

export default function DashboardStats() {
  const [status, setStatus] = useState<PlayoutStatus | null>(null);
  const [np, setNp] = useState<NowPlayingPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const [s, n] = await Promise.all([getPlayoutStatus(), getNowPlaying()]);
        if (!active) return;
        setStatus(s);
        setNp(n);
        setError(null);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load");
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6 p-6">
      {error && (
        <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* KPIs — live where available, stubbed (Phase 6) where not. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Online listeners"
          value={status?.listeners ?? "—"}
          accent
          hint="Live from Icecast"
        />
        <StatCard
          label="Source"
          value={
            <span className="capitalize">{status?.source ?? "—"}</span>
          }
          hint={status?.autopilot ? "Autopilot ON" : "Autopilot OFF"}
        />
        <StatCard
          label="Uptime"
          value={status ? formatClock(status.uptime) : "—"}
          hint="API process uptime"
        />
        <StatCard
          label="Countries"
          value="—"
          hint="Phase 6 analytics"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Now playing */}
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Now playing
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-700 text-2xl text-slate-500">
              {np?.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={np.thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                "♫"
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-100">
                {np?.title || "Nothing on air"}
              </div>
              <div className="truncate text-sm text-slate-400">
                {np?.artist || "—"}
                {np?.album ? ` — ${np.album}` : ""}
              </div>
              <div className="mt-1">
                {status?.source === "live" ? (
                  <Badge tone="red">ON AIR · LIVE</Badge>
                ) : (
                  <Badge tone="brand">{status?.source || "autodj"}</Badge>
                )}
              </div>
            </div>
          </div>

          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last played tracks
          </h3>
          <ComingSoon feature="Play history & track reports" phase="Phase 6" />
        </section>

        {/* Broadcast link settings (read-only) */}
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Broadcast link settings
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Host" value={BROADCAST.host} />
            <Field label="Port" value={BROADCAST.port} />
            <Field label="Mount point" value={BROADCAST.mount} />
            <Field label="Username" value={BROADCAST.user} />
            <Field label="Encoding" value={BROADCAST.encoding} />
            <Field label="Source password" value="••••••••" />
          </dl>
          <div className="mt-4 rounded-md bg-ink-900 px-3 py-2 text-xs text-slate-400">
            <span className="text-slate-500">Public stream URL</span>
            <div className="mt-1 break-all font-mono text-slate-300">
              {BROADCAST.stream}
            </div>
          </div>
        </section>
      </div>

      {/* World map / regional heat — Phase 6 */}
      <section className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Listener map
        </h2>
        <ComingSoon feature="Regional listener heat map" phase="Phase 6" />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-200">{value}</dd>
    </div>
  );
}
