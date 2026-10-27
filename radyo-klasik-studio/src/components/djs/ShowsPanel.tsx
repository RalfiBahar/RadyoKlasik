"use client";

import { useEffect, useState } from "react";
import { createShow, deleteShow, listEpisodes, updateShow } from "@/lib/api";
import type { Episode, Playlist, Show, StaffUser } from "@/lib/types";
import { SLOT_COLORS } from "@/lib/schedule";
import { EmptyState, ErrorText, Field, Modal } from "@/components/ui";

// Show profiles: title, tagline, colour, hosts (DJs), automation playlist,
// and the episode log written whenever the show goes live.
export default function ShowsPanel({
  shows,
  users,
  playlists,
  onChanged,
}: {
  shows: Show[];
  users: StaffUser[];
  playlists: Playlist[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Show | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Shows</div>
          <div className="text-xs text-slate-500">
            Put shows on the schedule in Scheduling. Hosts may go live during their show.
          </div>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + New show
        </button>
      </div>
      {shows.length === 0 ? (
        <EmptyState>No shows yet.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shows.map((s) => (
            <button
              key={s.id}
              onClick={() => setEditing(s)}
              className="rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-left hover:border-ink-600"
            >
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: s.color || "#64748b" }} />
                <span className="font-semibold text-slate-100">{s.title}</span>
              </div>
              {s.tagline && <div className="mt-0.5 text-xs text-slate-400">{s.tagline}</div>}
              <div className="mt-2 text-xs text-slate-500">
                Hosts: {s.hosts.length ? s.hosts.map((h) => h.name).join(", ") : "none"}
                {s.playlistName ? ` · Playlist: ${s.playlistName}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ShowModal
          show={editing}
          users={users}
          playlists={playlists}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function ShowModal({
  show,
  users,
  playlists,
  onClose,
  onSaved,
}: {
  show: Show | null;
  users: StaffUser[];
  playlists: Playlist[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(show?.title || "");
  const [tagline, setTagline] = useState(show?.tagline || "");
  const [color, setColor] = useState(show?.color || SLOT_COLORS[0]);
  const [playlistId, setPlaylistId] = useState(show?.playlistId || "");
  const [hostIds, setHostIds] = useState<string[]>(show?.hosts.map((h) => h.id) || []);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const djs = users.filter((u) => u.role !== "guest" && u.active);

  useEffect(() => {
    if (!show) return;
    listEpisodes(show.id)
      .then((r) => setEpisodes(r.items))
      .catch(() => setEpisodes([]));
  }, [show]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      title,
      tagline: tagline || null,
      color,
      playlistId: playlistId || null,
      hostIds,
    };
    try {
      if (show) await updateShow(show.id, payload);
      else await createShow(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!show || !window.confirm(`Delete "${show.title}" and its schedule slots?`)) return;
    try {
      await deleteShow(show.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const toggleHost = (id: string) =>
    setHostIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Modal
      title={show ? "Edit show" : "New show"}
      onClose={onClose}
      wide
      footer={
        <>
          {show && (
            <button className="btn-danger mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Tagline">
          <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </Field>
        <Field label="Automation playlist" hint="Plays during the show's slots when no DJ is live.">
          <select className="input" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
            <option value="">— whole library —</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-slate-400">Colour</div>
          <div className="flex flex-wrap gap-2">
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
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase text-slate-400">Hosts</div>
        {djs.length === 0 ? (
          <p className="text-xs text-slate-500">Add DJ accounts first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {djs.map((u) => (
              <label
                key={u.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                  hostIds.includes(u.id)
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-ink-600 text-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={hostIds.includes(u.id)}
                  onChange={() => toggleHost(u.id)}
                />
                {u.displayName || u.username}
              </label>
            ))}
          </div>
        )}
      </div>

      {show && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-slate-400">Episodes</div>
          {episodes == null ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : episodes.length === 0 ? (
            <p className="text-xs text-slate-500">Logged automatically the first time a host goes live in this show.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto scroll-thin text-xs">
              {episodes.map((e) => (
                <li key={e.id} className="flex justify-between text-slate-300">
                  <span>{e.title}</span>
                  <span className="text-slate-500">{e.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
