"use client";

import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${
          accent ? "text-brand" : "text-slate-100"
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "green" | "red" | "blue" | "amber";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-ink-600 text-slate-200",
    brand: "bg-brand/20 text-brand",
    green: "bg-emerald-500/20 text-emerald-300",
    red: "bg-red-500/20 text-red-300",
    blue: "bg-sky-500/20 text-sky-300",
    amber: "bg-amber-500/20 text-amber-300",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-brand" />
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-700 p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function ComingSoon({ feature, phase }: { feature: string; phase: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-700 bg-ink-800/50 p-6 text-center">
      <div className="text-sm font-medium text-slate-300">{feature}</div>
      <div className="mt-1 text-xs text-slate-500">
        Coming soon — backed by {phase}.
      </div>
    </div>
  );
}
