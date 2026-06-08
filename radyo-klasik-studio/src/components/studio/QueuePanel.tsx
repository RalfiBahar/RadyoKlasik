"use client";

import { useState } from "react";
import { removeFromQueue, reorderQueue } from "@/lib/api";
import type { AutoDjQueueItem, QueueItem } from "@/lib/types";
import { reorder } from "@/lib/array";
import { formatDuration } from "@/lib/format";
import { Badge } from "@/components/ui";

// Right "NEXT / queue" panel: upcoming items with drag-reorder, remove, and
// source badges. Backed by Phase 3 (/api/v1/queue*) and refreshed live by the
// /ws/studio queue:update events flowing through the parent.
export default function QueuePanel({
  items,
  autodjItems = [],
  autopilot = false,
  onChanged,
}: {
  items: QueueItem[];
  autodjItems?: AutoDjQueueItem[];
  autopilot?: boolean;
  onChanged?: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const commitReorder = async (from: number, to: number) => {
    const next = reorder(items, from, to);
    const orderedIds = next.map((i) => i.id);
    setBusy(true);
    try {
      await reorderQueue(orderedIds);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await removeFromQueue(id);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-700 p-3">
        <div className="text-xs font-semibold uppercase text-slate-400">
          Next ({items.length + (autopilot ? autodjItems.length : 0)})
        </div>
        {busy && <span className="text-xs text-slate-500">Saving…</span>}
      </div>
      <ul className="flex-1 overflow-y-auto scroll-thin" data-testid="queue-list">
        {items.map((item, idx) => (
          <li
            key={item.id}
            draggable
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== idx) {
                commitReorder(dragIndex, idx);
              }
              setDragIndex(null);
            }}
            data-testid={`queue-item-${item.id}`}
            className={`flex cursor-grab items-center gap-2 border-b border-ink-800 px-3 py-2 ${
              item.status === "playing" ? "bg-brand/10" : "hover:bg-ink-800/60"
            }`}
          >
            <span className="text-slate-600" aria-hidden>
              ⠿
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-slate-100">
                {item.track?.title || "Unknown track"}
              </div>
              <div className="truncate text-xs text-slate-500">
                {item.track?.artist || "—"} · {formatDuration(item.track?.duration)}
              </div>
            </div>
            <SourceBadge item={item} />
            <button
              className="text-slate-500 hover:text-red-400"
              onClick={() => remove(item.id)}
              title="Remove"
              aria-label={`Remove ${item.track?.title ?? "track"}`}
            >
              ✕
            </button>
          </li>
        ))}
        {autopilot && autodjItems.length > 0 && (
          <>
            <li className="border-b border-ink-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              AutoDJ rotation
            </li>
            {autodjItems.map((item) => (
              <li
                key={item.id}
                data-testid={`autodj-item-${item.id}`}
                className="flex items-center gap-2 border-b border-ink-800 px-3 py-2"
              >
                <span className="text-slate-600" aria-hidden>
                  ♫
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-100">
                    {item.track?.title || "Unknown track"}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {item.track?.artist || "—"} · {formatDuration(item.track?.duration)}
                  </div>
                </div>
                <Badge tone={item.kind === "jingle" ? "amber" : "green"}>AUTO</Badge>
              </li>
            ))}
          </>
        )}
        {items.length === 0 && (!autopilot || autodjItems.length === 0) && (
          <li className="px-3 py-6 text-center text-sm text-slate-500">
            {autopilot
              ? "Queue is empty — AutoDJ rotation is loading."
              : "Queue is empty — AutoDJ is off."}
          </li>
        )}
      </ul>
    </div>
  );
}

function SourceBadge({ item }: { item: QueueItem }) {
  if (item.status === "playing") return <Badge tone="brand">ON AIR</Badge>;
  const isBreak = item.track?.type === "jingle" || item.track?.type === "commercial";
  return isBreak ? (
    <Badge tone="amber">BREAK</Badge>
  ) : (
    <Badge tone="blue">USER</Badge>
  );
}
