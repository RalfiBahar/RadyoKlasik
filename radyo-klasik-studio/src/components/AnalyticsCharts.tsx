"use client";

import { useEffect, useRef, useState } from "react";
import {
  downloadAnalyticsCsv,
  getDevices,
  getHourly,
  getListenersReport,
  getMonthlyTracks,
  getRegional,
  getTrackReport,
} from "@/lib/api";
import type {
  DeviceRow,
  HourlyRow,
  ListenersReport,
  MonthlyRow,
  RegionalRow,
  TrackReportRow,
} from "@/lib/types";
import { countryFlag, countryName } from "@/lib/geo";
import { EmptyState, ErrorText, Spinner, StatCard } from "@/components/ui";

// Phase 6 analytics (RadioJar parity): Listeners / Track reports / Monthly
// tracks, period selector, KPI row, listeners-over-time, hourly, devices,
// regional, CSV export. All periods are in the station timezone.

const TABS = ["Listeners", "Track reports", "Monthly tracks"] as const;
type Tab = (typeof TABS)[number];

const PERIODS: { value: string; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export default function AnalyticsCharts() {
  const [tab, setTab] = useState<Tab>("Listeners");
  const [period, setPeriod] = useState("today");
  const [error, setError] = useState<string | null>(null);

  const exportType = tab === "Track reports" ? "tracks" : "listeners";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md bg-ink-800 p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm ${
                tab === t ? "bg-brand text-white" : "text-slate-300 hover:bg-ink-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab !== "Monthly tracks" && (
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input w-auto"
              aria-label="Period"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost"
              onClick={() =>
                downloadAnalyticsCsv(exportType, period).catch((e) =>
                  setError(e instanceof Error ? e.message : "Export failed")
                )
              }
            >
              Export CSV
            </button>
          </div>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      {tab === "Listeners" && <ListenersTab period={period} onError={setError} />}
      {tab === "Track reports" && <TracksTab period={period} onError={setError} />}
      {tab === "Monthly tracks" && <MonthlyTab onError={setError} />}
    </div>
  );
}

// --- Listeners --------------------------------------------------------------

function ListenersTab({ period, onError }: { period: string; onError: (e: string | null) => void }) {
  const [report, setReport] = useState<ListenersReport | null>(null);
  const [regional, setRegional] = useState<RegionalRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  useEffect(() => {
    let active = true;
    setReport(null);
    onError(null);
    Promise.all([getListenersReport(period), getRegional(period), getHourly(period), getDevices(period)])
      .then(([r, reg, h, d]) => {
        if (!active) return;
        setReport(r);
        setRegional(reg.items);
        setHourly(h.items);
        setDevices(d.items);
      })
      .catch((e) => active && onError(e instanceof Error ? e.message : "Failed to load analytics"));
    return () => {
      active = false;
    };
  }, [period, onError]);

  if (!report) return <Spinner label="Loading analytics…" />;
  const k = report.kpis;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Peak listeners" value={k.peakListeners} accent />
        <StatCard label="Avg listeners" value={k.avgListeners} />
        <StatCard label="Listening hours" value={k.listeningHours} />
        <StatCard label="Sessions" value={k.totalSessions} hint={`${k.avgSessionsPerHour} / hour`} />
        <StatCard label="Avg session" value={`${k.avgListeningMinutes} min`} hint={`${k.uniqueListeners} unique listeners`} />
        <StatCard label="Data served" value={`${k.totalGb} GB`} />
      </div>

      <section className="card">
        <SectionTitle
          title="Listeners over time"
          hint={`Average concurrent listeners per ${report.bucket} · ${report.timezone}`}
        />
        <AreaChart report={report} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <SectionTitle title="Countries" hint="Sessions by listener country" />
          <BarList
            rows={[...regional]
              .sort((a, b) => Number(a.country == null) - Number(b.country == null))
              .map((r) => ({
              key: r.country || "unknown",
              label: `${countryFlag(r.country)} ${countryName(r.country)}`,
              value: r.sessions,
              detail: `${r.pct}% · ${r.uniqueListeners} unique · ${r.listeningHours} h`,
            }))}
            empty="No finished sessions in this period yet."
          />
        </section>
        <section className="card">
          <SectionTitle title="Devices" hint="Sessions by listening device" />
          <BarList
            rows={devices.map((d) => ({
              key: d.device,
              label: d.device,
              value: d.sessions,
              detail: `${d.pct}% · avg ${d.avgListeningMinutes} min`,
            }))}
            empty="No finished sessions in this period yet."
          />
        </section>
      </div>

      <section className="card">
        <SectionTitle title="By hour of day" hint="Average concurrent listeners · sessions started" />
        <HourlyChart rows={hourly} />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-400">Show table</summary>
          <table className="mt-2 w-full text-xs tabular-nums">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Hour</th>
                <th>Avg listeners</th>
                <th>Peak</th>
                <th>Sessions</th>
                <th>Avg minutes</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {hourly.map((h) => (
                <tr key={h.hour} className="border-t border-ink-700">
                  <td className="py-1">{String(h.hour).padStart(2, "0")}:00</td>
                  <td>{h.avgListeners}</td>
                  <td>{h.peakListeners}</td>
                  <td>{h.sessions}</td>
                  <td>{h.avgListeningMinutes}</td>
                  <td>{h.listeningHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
      <p className="text-xs text-slate-500">
        Sessions through the HTTPS stream are counted when the listener disconnects; listener
        counts and hours come from per-minute snapshots. Country data: GeoLite2 by MaxMind.
      </p>
    </>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function formatBucket(t: string, bucket: "hour" | "day") {
  // The API returns station-local wall time without an offset.
  const d = new Date(t.replace(" ", "T").replace(/Z?$/, "Z"));
  return bucket === "hour"
    ? `${String(d.getUTCHours()).padStart(2, "0")}:00`
    : d.toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
}

function AreaChart({ report }: { report: ListenersReport }) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  // Draw at the container's real width so text isn't scaled.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const data = report.series;
  if (data.length === 0) return <EmptyState>No listener data recorded for this period yet.</EmptyState>;

  const H = 200;
  const pad = { l: 32, r: 28, t: 8, b: 22 };
  const max = Math.max(1, ...data.map((d) => d.peak));
  const x = (i: number) => pad.l + (data.length === 1 ? 0.5 : i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.avg)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(4, W / 90)));
  // With only a few buckets (e.g. early in "today") a line alone is invisible.
  const showPoints = data.length <= 12;

  return (
    <div className="relative" ref={boxRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full"
        role="img"
        aria-label="Average concurrent listeners over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          data.forEach((_, i) => {
            if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          });
          setHover(best);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#272c34" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#64748b">
              {t}
            </text>
          </g>
        ))}
        <path d={area} fill="#f4632e" opacity="0.18" />
        <path d={line} fill="none" stroke="#f4632e" strokeWidth="2" strokeLinejoin="round" />
        {showPoints &&
          data.map((d, i) => (
            <circle key={d.t} cx={x(i)} cy={y(d.avg)} r="4" fill="#f4632e" stroke="#1c2026" strokeWidth="2" />
          ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text
              key={d.t}
              x={x(i)}
              y={H - 6}
              textAnchor={i === data.length - 1 && i > 0 ? "end" : i === 0 ? "start" : "middle"}
              fontSize="10"
              fill="#64748b"
            >
              {formatBucket(d.t, report.bucket)}
            </text>
          ) : null
        )}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].avg)} r="4" fill="#f4632e" stroke="#1c2026" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-slate-200 shadow"
          style={{
            left: x(hover),
            // Keep the tooltip inside the chart near either edge.
            transform:
              x(hover) > W - 120 ? "translateX(-100%)" : x(hover) < 120 ? "none" : "translateX(-50%)",
          }}
        >
          <div className="font-semibold">{formatBucket(data[hover].t, report.bucket)}</div>
          <div>Avg {data[hover].avg} · Peak {data[hover].peak}</div>
        </div>
      )}
    </div>
  );
}

function HourlyChart({ rows }: { rows: HourlyRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.avgListeners));
  return (
    <div className="flex h-32 items-end gap-[2px]" role="img" aria-label="Average listeners by hour of day">
      {rows.map((r) => (
        <div key={r.hour} className="group relative flex h-full flex-1 flex-col justify-end">
          <div className="flex flex-1 flex-col justify-end">
            <div
              className="rounded-t bg-brand/70 group-hover:bg-brand"
              style={{ height: `${Math.max(r.avgListeners > 0 ? 2 : 0, (r.avgListeners / max) * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-center text-[9px] tabular-nums text-slate-500">
            {/* Every bar gets the label row so all bars share one baseline. */}
            {r.hour % 3 === 0 ? String(r.hour).padStart(2, "0") : "\u00a0"}
          </div>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-slate-200 group-hover:block">
            {String(r.hour).padStart(2, "0")}:00 · avg {r.avgListeners} · {r.sessions} sessions
          </div>
        </div>
      ))}
    </div>
  );
}

function BarList({
  rows,
  empty,
}: {
  rows: { key: string; label: string; value: number; detail: string }[];
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.slice(0, 12).map((r) => (
        <li key={r.key} title={r.detail}>
          <div className="mb-0.5 flex justify-between text-sm">
            <span className="truncate text-slate-200">{r.label}</span>
            <span className="tabular-nums text-slate-400">{r.value}</span>
          </div>
          <div className="h-2 rounded bg-ink-700">
            <div className="h-full rounded bg-brand/80" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{r.detail}</div>
        </li>
      ))}
    </ul>
  );
}

// --- Track reports ------------------------------------------------------------

function TracksTab({ period, onError }: { period: string; onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<TrackReportRow[] | null>(null);
  const [type, setType] = useState<"" | "song" | "jingle" | "commercial">("song");

  useEffect(() => {
    let active = true;
    setRows(null);
    getTrackReport(period, type || undefined)
      .then((r) => active && setRows(r.items))
      .catch((e) => active && onError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      active = false;
    };
  }, [period, type, onError]);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle title="Most played" hint="From the on-air play history" />
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Track type">
          <option value="song">Songs</option>
          <option value="jingle">Jingles</option>
          <option value="commercial">Commercials</option>
          <option value="">All</option>
        </select>
      </div>
      {rows == null ? (
        <Spinner label="Loading…" />
      ) : rows.length === 0 ? (
        <EmptyState>Nothing played in this period.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">#</th>
              <th>Title</th>
              <th>Artist</th>
              <th className="text-right">Plays</th>
              <th className="text-right">Requested</th>
              <th className="text-right">Last played</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.trackId} className="border-t border-ink-700">
                <td className="py-2 text-slate-500">{i + 1}</td>
                <td className="text-slate-100">{r.title}</td>
                <td className="text-slate-400">{r.artist || "—"}</td>
                <td className="text-right tabular-nums text-slate-200">{r.plays}</td>
                <td className="text-right tabular-nums text-slate-400">{r.requested}</td>
                <td className="text-right text-slate-400">
                  {new Date(r.lastPlayed).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// --- Monthly tracks -----------------------------------------------------------

function MonthlyTab({ onError }: { onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<MonthlyRow[] | null>(null);

  useEffect(() => {
    getMonthlyTracks(12)
      .then((r) => setRows(r.items))
      .catch((e) => onError(e instanceof Error ? e.message : "Failed to load"));
  }, [onError]);

  return (
    <section className="card space-y-3">
      <SectionTitle title="Monthly tracks" hint="Plays per month (last 12 months) — useful for royalty reporting" />
      {rows == null ? (
        <Spinner label="Loading…" />
      ) : rows.length === 0 ? (
        <EmptyState>No play history yet.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Month</th>
              <th className="text-right">Plays</th>
              <th className="text-right">Different tracks</th>
              <th className="pl-6">Most played</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month} className="border-t border-ink-700">
                <td className="py-2 text-slate-100">{m.month}</td>
                <td className="text-right tabular-nums text-slate-200">{m.plays}</td>
                <td className="text-right tabular-nums text-slate-400">{m.distinctTracks}</td>
                <td className="pl-6 text-slate-300">
                  {m.topTrack ? `${m.topTrack.title}${m.topTrack.artist ? ` — ${m.topTrack.artist}` : ""} (${m.topTrack.plays})` : "—"}
                </td>
                <td className="text-right">
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() =>
                      downloadAnalyticsCsv("tracks", m.month).catch((e) =>
                        onError(e instanceof Error ? e.message : "Export failed")
                      )
                    }
                  >
                    CSV
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
