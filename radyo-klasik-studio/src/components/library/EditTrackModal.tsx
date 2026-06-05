"use client";

import { useState } from "react";
import { updateTrack } from "@/lib/api";
import type { Track, TrackType } from "@/lib/types";

const TYPES: TrackType[] = ["song", "jingle", "commercial"];

export default function EditTrackModal({
  track,
  onClose,
  onSaved,
}: {
  track: Track;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(track.title || "");
  const [artist, setArtist] = useState(track.artist || "");
  const [album, setAlbum] = useState(track.album || "");
  const [type, setType] = useState<TrackType>(track.type);
  const [tags, setTags] = useState((track.tags || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateTrack(track.id, {
        title,
        artist,
        album,
        type,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit track"
    >
      <div className="card w-full max-w-md space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit track</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <Labeled label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Labeled>
        <Labeled label="Artist">
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </Labeled>
        <Labeled label="Album">
          <input className="input" value={album} onChange={(e) => setAlbum(e.target.value)} />
        </Labeled>
        <div className="flex gap-3">
          <Labeled label="Type">
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as TrackType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Tags">
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Labeled>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex-1 space-y-1">
      <span className="text-xs uppercase text-slate-400">{label}</span>
      {children}
    </label>
  );
}
