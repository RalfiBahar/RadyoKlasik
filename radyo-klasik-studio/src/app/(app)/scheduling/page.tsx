"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionGuard } from "@/components/AppShell";
import { Badge, ErrorText, Field, PageHeader, Spinner } from "@/components/ui";
import ScheduleCalendar from "@/components/schedule/ScheduleCalendar";
import SlotModal, { type SlotDraft } from "@/components/schedule/SlotModal";
import {
  getSettings,
  listPlaylists,
  listSchedule,
  listShows,
  updateSettings,
  updateSlot,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addDays, minutesToTime, stationNow, stationTime, weekStart } from "@/lib/schedule";
import type {
  Playlist,
  ScheduleNow,
  ScheduleSlot,
  Show,
  StationSettings,
} from "@/lib/types";

const TIMEZONES = [
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export default function SchedulingPage() {
  const { role } = useAuth();
  const editable = role === "admin";

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [now, setNow] = useState<ScheduleNow | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [settings, setSettings] = useState<StationSettings | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState<ScheduleSlot | null>(null);
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sched, sh, pl, st] = await Promise.all([
        listSchedule(),
        listShows(),
        listPlaylists(),
        getSettings(),
      ]);
      setSlots(sched.items);
      setNow(sched.now);
      setShows(sh.items);
      setPlaylists(pl.items);
      setSettings(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the schedule");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const timezone = settings?.timezone || "Europe/Istanbul";
  const monday = useMemo(() => {
    const today = stationNow(timezone);
    return addDays(weekStart(today.date, today.dayOfWeek), weekOffset * 7);
  }, [timezone, weekOffset]);

  const move = async (
    slot: ScheduleSlot,
    p: { dayOfWeek: number; date: string; startMinute: number }
  ) => {
    setError(null);
    // Optimistic: move the block immediately, then persist.
    const patch = slot.date
      ? { date: p.date, startMinute: p.startMinute }
      : { dayOfWeek: p.dayOfWeek, startMinute: p.startMinute };
    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, ...patch } : s)));
    try {
      await updateSlot(slot.id, patch);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
      load();
    }
  };

  const closeModal = () => {
    setEditing(null);
    setDraft(null);
  };

  if (!settings) {
    return (
      <SectionGuard section="scheduling">
        <PageHeader title="Scheduling" subtitle="Shows, playlists & automation" />
        <div className="p-6">{error ? <ErrorText>{error}</ErrorText> : <Spinner label="Loading…" />}</div>
      </SectionGuard>
    );
  }

  return (
    <SectionGuard section="scheduling">
      <PageHeader
        title="Scheduling"
        subtitle={`Shows, playlists & automation · times in ${timezone}`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
              ‹
            </button>
            <button className="btn-ghost" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              This week
            </button>
            <button className="btn-ghost" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
              ›
            </button>
            {editable && (
              <button
                className="btn-primary"
                onClick={() => {
                  const t = stationNow(timezone);
                  setDraft({ dayOfWeek: t.dayOfWeek, date: t.date, startMinute: 600 });
                }}
              >
                + New slot
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-4 p-6">
        <OnAirNow now={now} />
        <ErrorText>{error}</ErrorText>

        <ScheduleCalendar
          slots={slots}
          monday={monday}
          timezone={timezone}
          editable={editable}
          onCreateAt={(p) => setDraft(p)}
          onEdit={(slot) => (editable ? setEditing(slot) : undefined)}
          onMove={move}
        />
        {editable && (
          <p className="text-xs text-slate-500">
            Click an empty spot to add a slot · drag a slot to move it · click it to edit.
            Outside scheduled slots AutoDJ plays the whole library.
          </p>
        )}

        <BreaksCard settings={settings} editable={editable} onSaved={setSettings} />
      </div>

      {(editing || draft) && (
        <SlotModal
          slot={editing}
          draft={draft}
          shows={shows}
          playlists={playlists}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            load();
          }}
        />
      )}
    </SectionGuard>
  );
}

function OnAirNow({ now }: { now: ScheduleNow | null }) {
  const a = now?.active;
  return (
    <div className="card flex items-center gap-3">
      <span
        className="h-3 w-3 rounded-full"
        style={{ background: a?.color || (a ? "#f4632e" : "#3a414c") }}
      />
      {a ? (
        <div className="text-sm">
          <span className="text-slate-400">On the schedule now: </span>
          <span className="font-semibold text-slate-100">{a.title}</span>
          {a.endsAt && (
            <span className="text-slate-400">
              {" "}
              · until {stationTime(a.endsAt, now?.timezone || "Europe/Istanbul")}
            </span>
          )}
          {a.playlistId && (
            <span className="ml-2">
              <Badge tone="blue">Playlist rotation</Badge>
            </span>
          )}
        </div>
      ) : (
        <div className="text-sm text-slate-400">
          Nothing scheduled right now — AutoDJ is playing the whole library.
        </div>
      )}
    </div>
  );
}

function BreaksCard({
  settings,
  editable,
  onSaved,
}: {
  settings: StationSettings;
  editable: boolean;
  onSaved: (s: StationSettings) => void;
}) {
  const [jingleEvery, setJingleEvery] = useState(settings.jingleEvery);
  const [commercialEvery, setCommercialEvery] = useState(settings.commercialEvery);
  const [enforce, setEnforce] = useState(settings.enforceSchedule);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    jingleEvery !== settings.jingleEvery ||
    commercialEvery !== settings.commercialEvery ||
    enforce !== settings.enforceSchedule ||
    timezone !== settings.timezone;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await updateSettings({
        jingleEvery,
        commercialEvery,
        enforceSchedule: enforce,
        timezone,
      });
      onSaved(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const cadence = (n: number) => (n === 0 ? "never" : `every ${n} song${n === 1 ? "" : "s"}`);

  return (
    <div className="card space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-100">Breaks & automation</div>
        <div className="text-xs text-slate-500">
          AutoDJ inserts jingles and commercials from the library between songs.
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Jingle" hint={cadence(jingleEvery)}>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={jingleEvery}
            disabled={!editable}
            onChange={(e) => setJingleEvery(Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
        <Field label="Commercial" hint={cadence(commercialEvery)}>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={commercialEvery}
            disabled={!editable}
            onChange={(e) => setCommercialEvery(Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
        <Field label="Station timezone">
          <select
            className="input"
            value={timezone}
            disabled={!editable}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Live access" hint="When on, DJs can only go live in their own show's slot (from 10 min before).">
          <label className="flex h-[38px] items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={enforce}
              disabled={!editable}
              onChange={(e) => setEnforce(e.target.checked)}
            />
            Enforce schedule
          </label>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      {editable && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save automation settings"}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
          <span className="text-xs text-slate-500">
            Current time in station: {minutesToTime(stationNow(settings.timezone).minute)}
          </span>
        </div>
      )}
    </div>
  );
}
