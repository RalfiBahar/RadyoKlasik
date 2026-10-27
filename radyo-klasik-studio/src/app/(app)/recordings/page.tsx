"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionGuard } from "@/components/AppShell";
import { Badge, EmptyState, ErrorText, Field, Modal, PageHeader, Spinner } from "@/components/ui";
import RecorderCard from "@/components/recordings/RecorderCard";
import ArtworkPicker from "@/components/recordings/ArtworkPicker";
import {
  deleteRecording,
  listArtworks,
  listRecordings,
  recordingAudioUrl,
  replaceRecordingFile,
  updateRecording,
  uploadRecordingToCloud,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebouncedValue } from "@/lib/hooks";
import { formatDuration } from "@/lib/format";
import type { ArtworkItem, RecordingItem, RecordingStorageStats } from "@/lib/types";

const PAGE = 25;

export default function RecordingsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [items, setItems] = useState<RecordingItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [storage, setStorage] = useState<RecordingStorageStats | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RecordingItem | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useDebouncedValue(search, 300);

  const loadArtworks = useCallback(() => {
    listArtworks()
      .then((r) => setArtworks(r.items))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (more = false) => {
      try {
        const res = await listRecordings({ q: q || undefined, limit: PAGE, offset: more ? items?.length || 0 : 0 });
        setItems((prev) => (more && prev ? [...prev, ...res.items] : res.items));
        setTotal(res.total);
        if (res.storage) setStorage(res.storage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recordings");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q]
  );

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadArtworks();
  }, [loadArtworks]);

  const onSaved = useCallback(() => {
    load();
    loadArtworks();
  }, [load, loadArtworks]);

  const remove = async (r: RecordingItem) => {
    if (!window.confirm(`Delete “${r.title}” (${new Date(r.date).toLocaleDateString()})? Listeners will no longer find it.`)) return;
    try {
      await deleteRecording(r.id);
      load();
      loadArtworks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const upload = async (r: RecordingItem) => {
    setUploading(r.id);
    setError(null);
    try {
      const updated = await uploadRecordingToCloud(r.id);
      setItems((prev) => prev && prev.map((x) => (x.id === r.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      load();
    } finally {
      setUploading(null);
    }
  };

  return (
    <SectionGuard section="recordings">
      <PageHeader title="Recordings" subtitle="Record programmes and manage the past programmes listeners can replay" />
      <div className="space-y-4 p-6">
        <RecorderCard
          artworks={artworks}
          onArtworksChanged={loadArtworks}
          onSaved={onSaved}
          canManageArtwork={isAdmin}
        />

        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Past programmes</div>
              <div className="text-xs text-slate-500">
                {total} recordings
                {storage?.configured && (
                  <>
                    {" "}
                    · {storage.counts.r2} in the cloud, {storage.counts.local + storage.counts.pending} on the server
                    {storage.mode === "r2" ? " · new recordings upload automatically" : ""}
                  </>
                )}
              </div>
              {storage && storage.failed > 0 && (
                <div className="text-xs text-red-400">
                  {storage.failed} upload(s) failed — they still play from the server and are retried every hour.
                </div>
              )}
            </div>
            <input
              className="input w-64"
              placeholder="Search title or subtitle…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ErrorText>{error}</ErrorText>
          {items == null ? (
            <Spinner label="Loading…" />
          ) : items.length === 0 ? (
            <EmptyState>No recordings yet. Start the recorder above to make one.</EmptyState>
          ) : (
            <ul className="divide-y divide-ink-700">
              {items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-ink-700">
                    {r.artworkUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.artworkUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate text-sm text-slate-100">
                      {r.title}
                      {r.special && <Badge tone="amber">{r.special}</Badge>}
                      {r.fileMissing && <Badge tone="red">file missing</Badge>}
                      {storage?.configured && <StorageBadge r={r} />}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {r.artist} · {new Date(r.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                      {formatDuration(r.duration)} · {r.sizeMb} MB · {r.plays} plays
                    </div>
                    {playing === r.id && (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio src={recordingAudioUrl(r.id)} controls autoPlay className="mt-2 h-8 w-full max-w-md" />
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => setPlaying(playing === r.id ? null : r.id)}
                      disabled={r.fileMissing}
                    >
                      {playing === r.id ? "Close" : "▶ Listen"}
                    </button>
                    {isAdmin && storage?.configured && r.storage !== "r2" && r.onDisk && (
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => upload(r)}
                        disabled={uploading === r.id}
                        title={r.storageError || "Send this recording to Cloudflare R2"}
                      >
                        {uploading === r.id ? "Uploading…" : r.storage === "pending" ? "Retry upload" : "Upload to cloud"}
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(r)}>
                          Edit
                        </button>
                        <button className="btn-ghost px-2 py-1 text-xs text-red-300" onClick={() => remove(r)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {items && items.length < total && (
            <button className="btn-ghost w-full" onClick={() => load(true)}>
              Load more ({total - items.length} left)
            </button>
          )}
        </section>

        {isAdmin && (
          <section className="card space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Artwork library</div>
              <div className="text-xs text-slate-500">
                Thumbnails for recordings. Artwork in use can&apos;t be deleted.
              </div>
            </div>
            <ArtworkPicker items={artworks} manage onChanged={loadArtworks} />
          </section>
        )}
      </div>

      {editing && (
        <EditRecordingModal
          recording={editing}
          artworks={artworks}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}
    </SectionGuard>
  );
}

function StorageBadge({ r }: { r: RecordingItem }) {
  if (r.storage === "r2") return <Badge tone="green">cloud</Badge>;
  if (r.storage === "pending")
    return (
      <span title={r.storageError || "Waiting to upload"}>
        <Badge tone={r.storageError ? "red" : "amber"}>{r.storageError ? "upload failed" : "uploading"}</Badge>
      </span>
    );
  return <Badge tone="neutral">server</Badge>;
}

function EditRecordingModal({
  recording,
  artworks,
  onClose,
  onSaved,
}: {
  recording: RecordingItem;
  artworks: ArtworkItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(recording.title);
  const [artist, setArtist] = useState(recording.artist);
  const [special, setSpecial] = useState(recording.special || "");
  const [artwork, setArtwork] = useState<string | null>(recording.artwork);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateRecording(recording.id, { title, artist, special: special || null, artwork });
      if (file) await replaceRecordingFile(recording.id, file);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit recording"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || !title.trim()}>
            {saving ? (file ? "Uploading…" : "Saving…") : "Save"}
          </button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Subtitle (artist line)">
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </Field>
        <Field label="Label (optional)" hint="Shown as a badge, e.g. “Special”.">
          <input className="input" value={special} onChange={(e) => setSpecial(e.target.value)} />
        </Field>
        <Field label="Replace audio (optional)" hint="Upload an edited version; duration updates automatically.">
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => fileInput.current?.click()}>
              Choose file
            </button>
            <span className="truncate text-xs text-slate-400">{file ? file.name : "No file chosen"}</span>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </Field>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium uppercase text-slate-400">Artwork</div>
        <ArtworkPicker items={artworks} selected={artwork} onSelect={setArtwork} />
      </div>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
