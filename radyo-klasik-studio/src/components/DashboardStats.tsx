"use client";

import { useEffect, useState } from "react";
import {
  getStreamUrls,
  getLiveAnalytics,
  getNowPlaying,
  getPlayoutStatus,
  type NowPlayingPublic,
} from "@/lib/api";
import type { LiveAnalytics, PlayoutStatus } from "@/lib/types";
import { formatClock } from "@/lib/format";
import { countryFlag, countryName } from "@/lib/geo";
import { stationTime } from "@/lib/schedule";
import { Badge, EmptyState, StatCard } from "@/components/ui";

const BROADCAST = {
  host: process.env.NEXT_PUBLIC_BROADCAST_HOST || "stream.radyoklasik.online",
  port: process.env.NEXT_PUBLIC_BROADCAST_PORT || "8005",
  mount: process.env.NEXT_PUBLIC_BROADCAST_MOUNT || "/live",
  user: process.env.NEXT_PUBLIC_BROADCAST_USER || "source",
  encoding: process.env.NEXT_PUBLIC_BROADCAST_ENCODING || "MP3 128k",
};

export default function DashboardStats() {
  const [status, setStatus] = useState<PlayoutStatus | null>(null);
  const [np, setNp] = useState<NowPlayingPublic | null>(null);
  const [live, setLive] = useState<LiveAnalytics | null>(null);
  // Public stream addresses come from the API (stream.<domain> in production).
  const [streamUrl, setStreamUrl] = useState<string | null>(process.env.NEXT_PUBLIC_STREAM_URL || null);

  useEffect(() => {
    if (streamUrl) return;
    getStreamUrls()
      .then((s) => setStreamUrl(s.mp3))
      .catch(() => {});
  }, [streamUrl]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const [s, n, l] = await Promise.all([
          getPlayoutStatus(),
          getNowPlaying(),
          getLiveAnalytics().catch(() => null),
        ]);
        if (!active) return;
        setStatus(s);
        setNp(n);
        setLive(l);
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

      {/* KPIs */}
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
            <span>
              {status?.source === "autodj"
                ? "AutoDJ"
                : status?.source === "request"
                  ? "Queue"
                  : status?.source === "live"
                    ? "Live"
                    : "—"}
            </span>
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
          value={live ? live.countries24h.length : "—"}
          hint="Listener countries, last 24 h"
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
          {live && live.lastPlayed.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {live.lastPlayed.map((p) => (
                <li key={p.startedAt} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 tabular-nums text-xs text-slate-500">
                    {stationTime(p.startedAt, live.timezone)}
                  </span>
                  <span className="truncate text-slate-200">{p.title || "Unknown"}</span>
                  {p.artist && <span className="truncate text-slate-500">— {p.artist}</span>}
                  {p.source !== "autodj" && (
                    <Badge tone={p.source === "live" ? "red" : "blue"}>{p.source}</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nothing has played yet.</EmptyState>
          )}
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
              {streamUrl || "—"}
            </div>
          </div>
        </section>
      </div>

      {/* Where listeners are (last 24 h) */}
      <section className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Top countries · last 24 h
        </h2>
        {live && live.countries24h.length > 0 ? (
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {live.countries24h.map((c) => {
              const max = live.countries24h[0].sessions || 1;
              return (
                <li key={c.country} title={`${c.sessions} sessions`}>
                  <div className="mb-0.5 flex justify-between text-sm">
                    <span className="text-slate-200">
                      {countryFlag(c.country)} {countryName(c.country)}
                    </span>
                    <span className="tabular-nums text-slate-400">{c.sessions}</span>
                  </div>
                  <div className="h-1.5 rounded bg-ink-700">
                    <div className="h-full rounded bg-brand/80" style={{ width: `${(c.sessions / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>No listener sessions with a known country in the last 24 hours.</EmptyState>
        )}
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
