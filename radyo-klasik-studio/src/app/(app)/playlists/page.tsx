"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionGuard } from "@/components/AppShell";
import { EmptyState, ErrorText, PageHeader } from "@/components/ui";
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  listTracks,
  removePlaylistItem,
  reorderPlaylist,
  updatePlaylist,
} from "@/lib/api";
import { reorder } from "@/lib/array";
import { formatDuration } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Playlist, PlaylistDetail, Track } from "@/lib/types";

type PlaylistRow = Playlist & { itemCount?: number };

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await listPlaylists();
      setPlaylists(res.items);
      setSelectedId((cur) => cur ?? res.items[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playlists");
    }
  }, []);

  const loadDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await getPlaylist(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playlist");
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);
  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const refresh = async () => {
    await Promise.all([loadList(), loadDetail(selectedId)]);
  };

  const create = async () => {
    if (!newName.trim()) return;
    setError(null);
    try {
      const p = await createPlaylist({ name: newName.trim() });
      setNewName("");
      setSelectedId(p.id);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <SectionGuard section="playlists">
      <PageHeader
        title="Playlists"
        subtitle="Build playlists, then schedule them as blocks or show automation"
      />
      <div className="grid gap-4 p-6 md:grid-cols-[260px_1fr]">
        <aside className="card space-y-2 self-start">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="New playlist name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button className="btn-primary" onClick={create} disabled={!newName.trim()}>
              +
            </button>
          </div>
          <ul className="space-y-1">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                    selectedId === p.id ? "bg-brand/15 text-brand" : "text-slate-300 hover:bg-ink-700"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.itemCount ?? 0}</span>
                </button>
              </li>
            ))}
            {playlists.length === 0 && (
              <li className="px-1 py-4 text-center text-xs text-slate-500">No playlists yet.</li>
            )}
          </ul>
        </aside>

        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          {detail ? (
            <PlaylistEditor
              key={detail.id}
              playlist={detail}
              onChanged={refresh}
              onDeleted={async () => {
                setSelectedId(null);
                setDetail(null);
                await loadList();
              }}
              onError={setError}
            />
          ) : (
            <EmptyState>Create a playlist to start.</EmptyState>
          )}
        </div>
      </div>
    </SectionGuard>
  );
}

function PlaylistEditor({
  playlist,
  onChanged,
  onDeleted,
  onError,
}: {
  playlist: PlaylistDetail;
  onChanged: () => void;
  onDeleted: () => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(playlist.name);
  const [items, setItems] = useState(playlist.items);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const debounced = useDebouncedValue(search, 300);

  useEffect(() => setItems(playlist.items), [playlist.items]);

  useEffect(() => {
    const controller = new AbortController();
    listTracks(
      { q: debounced || undefined, type: "song", pageSize: 50, sort: "title", order: "ASC" },
      controller.signal
    )
      .then((r) => setResults(r.items))
      .catch(() => {});
    return () => controller.abort();
  }, [debounced]);

  const inPlaylist = new Set(items.map((i) => i.track?.id));
  const total = items.reduce((sum, i) => sum + (i.track?.duration || 0), 0);

  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
      onChanged();
    }
  };

  const drop = (to: number) => {
    if (dragIndex === null || dragIndex === to) return;
    const next = reorder(items, dragIndex, to);
    setItems(next); // optimistic
    setDragIndex(null);
    run(() => reorderPlaylist(playlist.id, next.map((i) => i.id)));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <input
            className="input text-base font-semibold"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() && name !== playlist.name && run(() => updatePlaylist(playlist.id, { name: name.trim() }))
            }
            aria-label="Playlist name"
          />
          <button
            className="btn-danger"
            onClick={async () => {
              if (!window.confirm(`Delete playlist "${playlist.name}"?`)) return;
              try {
                await deletePlaylist(playlist.id);
                onDeleted();
              } catch (err) {
                onError(err instanceof Error ? err.message : "Delete failed");
              }
            }}
          >
            Delete
          </button>
        </div>
        <div className="text-xs text-slate-500">
          {items.length} tracks · {formatDuration(total)} total · drag to reorder (order is used
          when a slot isn&apos;t shuffled)
        </div>
        <ul className="max-h-[560px] overflow-y-auto scroll-thin" data-testid="playlist-items">
          {items.map((item, idx) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                drop(idx);
              }}
              className="flex cursor-grab items-center gap-2 border-b border-ink-700 px-1 py-2 hover:bg-ink-700/40"
            >
              <span className="w-6 text-right text-xs tabular-nums text-slate-500">{idx + 1}</span>
              <span className="text-slate-600" aria-hidden>
                ⠿
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">{item.track?.title || "Missing track"}</div>
                <div className="truncate text-xs text-slate-500">
                  {item.track?.artist || "—"} · {formatDuration(item.track?.duration)}
                </div>
              </div>
              <button
                className="text-slate-500 hover:text-red-400"
                aria-label={`Remove ${item.track?.title ?? "track"}`}
                onClick={() => run(() => removePlaylistItem(playlist.id, item.id))}
              >
                ✕
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-500">Add songs from the library →</li>
          )}
        </ul>
      </div>

      <div className="card space-y-3">
        <div className="text-sm font-semibold text-slate-100">Add from library</div>
        <input
          className="input"
          placeholder="Search songs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="max-h-[560px] overflow-y-auto scroll-thin">
          {results.map((t) => (
            <li key={t.id} className="flex items-center gap-2 border-b border-ink-700 px-1 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">{t.title}</div>
                <div className="truncate text-xs text-slate-500">
                  {t.artist || "—"} · {formatDuration(t.duration)}
                </div>
              </div>
              <button
                className={inPlaylist.has(t.id) ? "btn-ghost px-2 py-1 text-xs" : "btn-primary px-2 py-1 text-xs"}
                onClick={() => run(() => addPlaylistItem(playlist.id, t.id))}
                aria-label={`Add ${t.title} to playlist`}
              >
                {inPlaylist.has(t.id) ? "+ Again" : "+ Add"}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-500">No songs match.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
