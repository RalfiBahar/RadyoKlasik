"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScheduleSlot } from "@/lib/types";
import {
  DAY_NAMES,
  WEEK_ORDER,
  addDays,
  minutesToTime,
  stationNow,
  weekSegments,
} from "@/lib/schedule";

const HOUR_PX = 44;
const PX_PER_MIN = HOUR_PX / 60;
const SNAP_MIN = 15;

// Weekly drag-and-drop schedule grid (Mon..Sun x 24h) in station time.
// Click an empty spot to create a slot there, click a slot to edit it, drag a
// slot to move it (editors only).
export default function ScheduleCalendar({
  slots,
  monday,
  timezone,
  editable,
  onCreateAt,
  onEdit,
  onMove,
}: {
  slots: ScheduleSlot[];
  monday: string;
  timezone: string;
  editable: boolean;
  onCreateAt: (p: { dayOfWeek: number; date: string; startMinute: number }) => void;
  onEdit: (slot: ScheduleSlot) => void;
  onMove: (slot: ScheduleSlot, p: { dayOfWeek: number; date: string; startMinute: number }) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => stationNow(timezone));
  const [dragging, setDragging] = useState<{ slot: ScheduleSlot; grabOffset: number } | null>(
    null
  );

  useEffect(() => {
    setNow(stationNow(timezone));
    const id = setInterval(() => setNow(stationNow(timezone)), 30000);
    return () => clearInterval(id);
  }, [timezone]);

  // Open the view around the morning rather than at midnight.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX;
  }, []);

  const dates = useMemo(() => WEEK_ORDER.map((_, i) => addDays(monday, i)), [monday]);
  const segments = useMemo(() => weekSegments(slots, monday), [slots, monday]);

  const minuteFromEvent = (e: React.MouseEvent | React.DragEvent, offset = 0) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const raw = (e.clientY - rect.top - offset) / PX_PER_MIN;
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
    return Math.max(0, Math.min(1440 - SNAP_MIN, snapped));
  };

  return (
    <div className="card overflow-hidden p-0">
      <div ref={scrollRef} className="max-h-[640px] overflow-y-auto scroll-thin">
        <div className="sticky top-0 z-30 grid grid-cols-[56px_repeat(7,1fr)] border-b border-ink-700 bg-ink-800">
          <div />
          {WEEK_ORDER.map((dow, i) => {
            const today = dates[i] === now.date;
            return (
              <div
                key={dow}
                className={`border-l border-ink-700 px-2 py-2 text-center text-xs ${
                  today ? "text-brand" : "text-slate-400"
                }`}
              >
                <div className="font-semibold uppercase">{DAY_NAMES[dow]}</div>
                <div className={today ? "font-bold" : ""}>{dates[i].slice(5).replace("-", "/")}</div>
              </div>
            );
          })}
        </div>
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
          {/* Hour labels */}
          <div>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                style={{ height: HOUR_PX }}
                className="pr-2 text-right text-[10px] tabular-nums text-slate-500"
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {WEEK_ORDER.map((dow, col) => (
            <div
              key={dow}
              data-testid={`day-col-${dow}`}
              className={`relative border-l border-ink-700 ${editable ? "cursor-copy" : ""}`}
              style={{ height: HOUR_PX * 24 }}
              onClick={(e) => {
                if (!editable || e.target !== e.currentTarget) return;
                onCreateAt({ dayOfWeek: dow, date: dates[col], startMinute: minuteFromEvent(e) });
              }}
              onDragOver={(e) => {
                if (dragging) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragging) return;
                onMove(dragging.slot, {
                  dayOfWeek: dow,
                  date: dates[col],
                  startMinute: minuteFromEvent(e, dragging.grabOffset),
                });
                setDragging(null);
              }}
            >
              {/* Hour lines */}
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-ink-700/60"
                  style={{ top: h * HOUR_PX }}
                />
              ))}

              {dates[col] === now.date && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                  style={{ top: now.minute * PX_PER_MIN }}
                  aria-label="Now"
                >
                  <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
                </div>
              )}

              {segments
                .filter((s) => s.column === col)
                .map((seg) => {
                  const { slot } = seg;
                  const color = slot.color || "#64748b";
                  const label = slot.title || slot.showTitle || slot.playlistName || "Block";
                  const height = Math.max(14, (seg.end - seg.start) * PX_PER_MIN - 2);
                  return (
                    <button
                      key={`${slot.id}-${seg.continued ? "b" : "a"}`}
                      type="button"
                      draggable={editable && !seg.continued}
                      onDragStart={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setDragging({ slot, grabOffset: e.clientY - rect.top });
                      }}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => onEdit(slot)}
                      className="absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight text-slate-100 hover:brightness-125"
                      style={{
                        top: seg.start * PX_PER_MIN + 1,
                        height,
                        borderLeftColor: color,
                        background: `${color}33`,
                      }}
                      title={`${label} · ${minutesToTime(slot.startMinute)}–${minutesToTime(
                        slot.startMinute + slot.durationMinutes
                      )}`}
                    >
                      <div className="truncate font-semibold">
                        {seg.continued ? "↳ " : ""}
                        {label}
                      </div>
                      {height > 26 && (
                        <div className="truncate text-slate-300">
                          {minutesToTime(slot.startMinute)}–
                          {minutesToTime(slot.startMinute + slot.durationMinutes)}
                          {slot.date ? " · once" : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
