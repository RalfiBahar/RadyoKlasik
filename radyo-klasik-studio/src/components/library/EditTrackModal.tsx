"use client";

import { useRef, useState } from "react";
import { trackAudioUrl, updateTrack, uploadTrackArtwork } from "@/lib/api";
import type { Track, TrackType } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { ErrorText, Field, Modal } from "@/components/ui";

const TYPES: TrackType[] = ["song", "jingle", "commercial"];

// Edit a track's metadata. Saving updates the library AND the audio file's own
// tags (so downloads / other players show the same), plus the cover art.
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
  const [composer, setComposer] = useState(track.composer || "");
  const [album, setAlbum] = useState(track.album || "");
  const [year, setYear] = useState(track.year ? String(track.year) : "");
  const [genre, setGenre] = useState(track.genre || "");
  const [type, setType] = useState<TrackType>(track.type);
  const [tags, setTags] = useState((track.tags || []).join(", "));
  const [comment, setComment] = useState(track.comment || "");
  const [artwork, setArtwork] = useState<File | null>(null);
  const [artPreview, setArtPreview] = useState<string | null>(track.artworkUrl);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const artInput = useRef<HTMLInputElement>(null);

  const pickArtwork = (f: File | null) => {
    setArtwork(f);
    if (f) setArtPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (year && !/^\d{1,4}$/.test(year)) {
      setError("Year must be a number");
      return;
    }
    setSaving(true);
    setError(null);
    setWarning(null);
    try {
      const res = await updateTrack(track.id, {
        title: title.trim(),
        artist,
        composer,
        album,
        year: year ? Number(year) : null,
        genre,
        comment,
        type,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      let fileOk = res.fileTags?.written !== false;
      if (artwork) {
        const art = await uploadTrackArtwork(track.id, artwork);
        fileOk = fileOk && art.fileTags?.written !== false;
      }
      if (!fileOk) {
        // Library is saved; only the file's embedded tags couldn't be updated.
        setWarning("Saved to the library, but the audio file's own tags couldn't be updated.");
        setSaving(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit track"
      onClose={onClose}
      wide
      footer={
        <>
          {warning && (
            <button className="btn-ghost mr-auto" onClick={onSaved}>
              Close
            </button>
          )}
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className="w-32 shrink-0 space-y-2">
          <button
            type="button"
            onClick={() => artInput.current?.click()}
            className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-ink-600 bg-ink-900"
            title="Replace cover art"
          >
            {artPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl text-slate-500">♫</span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100">
              Change cover
            </span>
          </button>
          <input
            ref={artInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickArtwork(e.target.files?.[0] || null)}
          />
          <div className="space-y-0.5 text-[11px] text-slate-500">
            <div>{(track.format || "").toUpperCase()} · {formatDuration(track.duration)}</div>
            {track.bitrate ? <div>{Math.round(track.bitrate / 1000)} kbps</div> : null}
            {track.size ? <div>{formatBytes(track.size)}</div> : null}
            {track.loudnessLufs != null && <div>{track.loudnessLufs.toFixed(1)} LUFS</div>}
          </div>
          <button type="button" className="btn-ghost w-full px-2 py-1 text-xs" onClick={() => setPreview((p) => !p)}>
            {preview ? "Stop" : "▶ Preview"}
          </button>
        </div>

        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Composer">
            <input className="input" value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="e.g. Claude Debussy" />
          </Field>
          <Field label="Artist / performer">
            <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </Field>
          <Field label="Album">
            <input className="input" value={album} onChange={(e) => setAlbum(e.target.value)} />
          </Field>
          <Field label="Year">
            <input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="Genre">
            <input className="input" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Baroque" />
          </Field>
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as TrackType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tags" hint="Comma separated, used for filtering.">
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Comment">
              <textarea className="input min-h-[60px]" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
      {preview && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={trackAudioUrl(track.id)} controls autoPlay className="h-8 w-full" />
      )}
      <p className="text-xs text-slate-500">
        Saving also writes these details (and a new cover) into the audio file itself.
      </p>
      {warning && <p className="text-sm text-amber-400">{warning}</p>}
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
