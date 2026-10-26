import type { ScheduleSlot } from "./types";

// Station-time helpers for the schedule UI. The schedule is defined in the
// station timezone (settings.timezone), which may differ from the browser's.

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Calendar columns run Monday..Sunday.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface StationParts {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sunday
  minute: number; // minutes from local midnight
}

export function stationNow(timeZone: string, now = new Date()): StationParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dayOfWeek: DAY_NAMES.indexOf(p.weekday),
    minute: Number(p.hour) * 60 + Number(p.minute),
  };
}

// Add `days` to a YYYY-MM-DD date (calendar arithmetic, timezone-free).
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

// Monday (YYYY-MM-DD) of the week containing `date` with weekday `dow`.
export function weekStart(date: string, dow: number): string {
  return addDays(date, -((dow + 6) % 7));
}

// HH:MM of an instant in the station timezone (not the browser's).
export function stationTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface SlotSegment {
  slot: ScheduleSlot;
  column: number; // 0..6 index into WEEK_ORDER
  start: number; // minute within that day
  end: number;
  continued: boolean; // the part after midnight
}

// Split the slots that appear in the week starting `monday` into per-day
// segments (a slot running past midnight continues in the next column).
export function weekSegments(slots: ScheduleSlot[], monday: string): SlotSegment[] {
  const out: SlotSegment[] = [];
  const dates = WEEK_ORDER.map((_, i) => addDays(monday, i));
  for (const slot of slots) {
    let column: number;
    if (slot.date) {
      column = dates.indexOf(slot.date);
      if (column < 0) {
        // A one-off from the previous day may spill into Monday.
        if (addDays(slot.date, 1) === monday && slot.startMinute + slot.durationMinutes > 1440) {
          out.push({ slot, column: 0, start: 0, end: slot.startMinute + slot.durationMinutes - 1440, continued: true });
        }
        continue;
      }
    } else {
      if (slot.dayOfWeek == null) continue;
      column = WEEK_ORDER.indexOf(slot.dayOfWeek);
    }
    const end = slot.startMinute + slot.durationMinutes;
    out.push({ slot, column, start: slot.startMinute, end: Math.min(end, 1440), continued: false });
    if (end > 1440) {
      const next = column + 1;
      // Weekly Sunday-night slots wrap into Monday of the same view.
      if (next <= 6 || !slot.date) {
        out.push({ slot, column: next % 7, start: 0, end: end - 1440, continued: true });
      }
    }
  }
  return out;
}

export const SLOT_COLORS = [
  "#f4632e",
  "#3b82f6",
  "#10b981",
  "#a855f7",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];
