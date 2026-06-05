"use client";

import { useState } from "react";
import { Badge, StatCard } from "@/components/ui";

// Phase 6 backs these endpoints; this is a UI shell with placeholder data so the
// layout matches the RadioJar Analytics screens (Listeners / Track reports /
// Monthly tracks tabs, KPI row, charts, period selector, export).

const TABS = ["Listeners", "Track reports", "Monthly tracks"] as const;
type Tab = (typeof TABS)[number];

const PERIODS = ["Today", "Yesterday", "7 days", "30 days"];

// Deterministic placeholder series so the shell renders something chart-like.
const SAMPLE = [4, 6, 5, 8, 6, 9, 7, 12, 10, 15, 11, 8, 6, 9, 14, 10, 7, 5, 4, 6, 8, 5, 3, 4];

export default function AnalyticsCharts() {
  const [tab, setTab] = useState<Tab>("Listeners");
  const [period, setPeriod] = useState(PERIODS[1]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md bg-ink-800 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm ${
                tab === t ? "bg-brand text-white" : "text-slate-300 hover:bg-ink-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="input w-auto"
            aria-label="Period"
          >
            {PERIODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button className="btn-ghost" disabled title="Phase 6">
            Export
          </button>
          <Badge tone="amber">Preview</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Avg sessions / hour" value="6" accent />
        <StatCard label="Total sessions" value="85" />
        <StatCard label="Avg listening min" value="20.8" />
        <StatCard label="Total listening hrs" value="47" />
        <StatCard label="Total GB" value="2.68" />
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {tab} · {period}
          </h2>
          <span className="text-xs text-slate-500">Placeholder data</span>
        </div>
        <Sparkbars data={SAMPLE} />
        <p className="mt-4 text-center text-xs text-slate-500">
          Live charts (regional map, hourly, device split, track reports, monthly,
          CSV export) arrive with Phase 6 analytics.
        </p>
      </section>
    </div>
  );
}

function Sparkbars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-brand/40"
          style={{ height: `${(v / max) * 100}%` }}
          title={`${v}`}
        />
      ))}
    </div>
  );
}
