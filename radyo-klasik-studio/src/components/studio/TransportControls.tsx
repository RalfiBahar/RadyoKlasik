"use client";

import { useState } from "react";
import { setAutopilot, skipTrack } from "@/lib/api";

// Transport: skip current track + autopilot (Autoplay) toggle. Backed by
// POST /api/v1/playout/skip and /api/v1/playout/autopilot (Phase 3).
export default function TransportControls({
  autopilot,
  onChanged,
}: {
  autopilot: boolean;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const onSkip = async () => {
    setBusy(true);
    try {
      await skipTrack();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const onToggleAutopilot = async () => {
    setBusy(true);
    try {
      await setAutopilot(!autopilot);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        className="btn-ghost"
        onClick={onSkip}
        disabled={busy}
        aria-label="Skip current track"
        title="Skip"
      >
        ⏭ Skip
      </button>
      <Toggle
        label="Autoplay"
        on={autopilot}
        onClick={onToggleAutopilot}
        disabled={busy}
      />
    </div>
  );
}

export function Toggle({
  label,
  on,
  onClick,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="flex items-center gap-2 text-sm text-slate-300 disabled:opacity-50"
    >
      <span className="text-xs uppercase">{label}</span>
      <span
        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
          on ? "bg-brand" : "bg-ink-600 ring-1 ring-inset ring-black/10"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
