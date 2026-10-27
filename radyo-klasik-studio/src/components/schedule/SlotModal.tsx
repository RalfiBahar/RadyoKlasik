"use client";

import { useState } from "react";
import { createSlot, deleteSlot, updateSlot, type SlotInput } from "@/lib/api";
import type { Playlist, ScheduleSlot, Show } from "@/lib/types";
import { DAY_NAMES, SLOT_COLORS, minutesToTime, timeToMinutes } from "@/lib/schedule";
import { ErrorText, Field, Modal } from "@/components/ui";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720];

export interface SlotDraft {
  dayOfWeek: number;
  date: string;
  startMinute: number;
}

// Create / edit one schedule slot: a show (live DJ window, optional automation
// playlist) or a plain playlist block; weekly or one-off.
export default function SlotModal({
  slot,
  draft,
  shows,
  playlists,
  onClose,
  onSaved,
}: {
  slot?: ScheduleSlot | null;
  draft?: SlotDraft | null;
  shows: Show[];
  playlists: Playlist[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"show" | "playlist">(
    slot ? (slot.showId ? "show" : "playlist") : shows.length ? "show" : "playlist"
  );
  const [showId, setShowId] = useState(slot?.showId || shows[0]?.id || "");
  const [playlistId, setPlaylistId] = useState(
    slot?.playlistId || (kind === "playlist" ? playlists[0]?.id || "" : "")
  );
  const [title, setTitle] = useState(slot?.title || "");
  const [repeat, setRepeat] = useState<"weekly" | "once">(slot?.date ? "once" : "weekly");
  const [dayOfWeek, setDayOfWeek] = useState(slot?.dayOfWeek ?? draft?.dayOfWeek ?? 1);
  const [date, setDate] = useState(slot?.date || draft?.date || "");
  const [start, setStart] = useState(minutesToTime(slot?.startMinute ?? draft?.startMinute ?? 600));
  const [duration, setDuration] = useState(slot?.durationMinutes ?? 60);
  const [shuffle, setShuffle] = useState(slot?.shuffle ?? true);
  const [color, setColor] = useState(slot?.color || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload: SlotInput = {
      title: title.trim() || null,
      showId: kind === "show" ? showId || null : null,
      playlistId: playlistId || null,
      startMinute: timeToMinutes(start),
      durationMinutes: duration,
      shuffle,
      color: color || null,
      ...(repeat === "once" ? { date, dayOfWeek: null } : { dayOfWeek, date: null }),
    };
    try {
      if (slot) await updateSlot(slot.id, payload);
      else await createSlot(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!slot || !window.confirm("Delete this schedule slot?")) return;
    setSaving(true);
    try {
      await deleteSlot(slot.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={slot ? "Edit schedule slot" : "New schedule slot"}
      onClose={onClose}
      footer={
        <>
          {slot && (
            <button className="btn-danger mr-auto" onClick={remove} disabled={saving}>
              Delete
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {(["show", "playlist"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              // A playlist block needs a playlist; the select has no "none".
              if (k === "playlist" && !playlistId) setPlaylistId(playlists[0]?.id || "");
            }}
            aria-pressed={kind === k}
            className={`rounded-md border px-2 py-2 text-xs font-medium ${
              kind === k ? "border-brand bg-brand/10 text-brand" : "border-ink-600 text-slate-300"
            }`}
          >
            {k === "show" ? "Show (live DJ window)" : "Playlist block"}
          </button>
        ))}
      </div>

      {kind === "show" ? (
        <Field label="Show" hint={shows.length ? undefined : "Create a show in DJ Management first."}>
          <select className="input" value={showId} onChange={(e) => setShowId(e.target.value)}>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field
        label={kind === "show" ? "Automation playlist (optional)" : "Playlist"}
        hint={
          kind === "show"
            ? "Plays while no DJ is live. Defaults to the show's own playlist."
            : "AutoDJ plays only this playlist's songs during the block."
        }
      >
        <select className="input" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
          {kind === "show" && <option value="">— show default —</option>}
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Title (optional)">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeats">
          <select
            className="input"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as "weekly" | "once")}
          >
            <option value="weekly">Every week</option>
            <option value="once">One time</option>
          </select>
        </Field>
        {repeat === "weekly" ? (
          <Field label="Day">
            <select
              className="input"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Date">
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
        )}
        <Field label="Starts">
          <input
            className="input"
            type="time"
            step={300}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Length">
          <select
            className="input"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} min` : `${d / 60} h`}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
        Shuffle the playlist (off = play in list order)
      </label>

      <div>
        <div className="mb-1 text-xs font-medium uppercase text-slate-400">Colour</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setColor("")}
            className={`h-6 rounded border px-2 text-[10px] ${
              color === "" ? "border-brand text-brand" : "border-ink-600 text-slate-400"
            }`}
          >
            Auto
          </button>
          {SLOT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded ${color === c ? "ring-2 ring-brand ring-offset-2" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
