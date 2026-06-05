"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bulkTracks,
  deleteTrack,
  listTracks,
  type ListTracksParams,
} from "@/lib/api";
import type { Track, TrackListResponse, TrackType } from "@/lib/types";
import { useDebouncedValue } from "@/lib/hooks";
import { formatDuration, formatSizeMb } from "@/lib/format";
import { Badge, Spinner } from "@/components/ui";
import UploadModal from "./UploadModal";
import EditTrackModal from "./EditTrackModal";

type TypeFilter = "all" | TrackType;

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "song", label: "Songs" },
  { key: "jingle", label: "Jingles" },
  { key: "commercial", label: "Commercials" },
];

const PAGE_SIZE = 15;

export default function LibraryView() {
  const [type, setType] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"ASC" | "DESC">("DESC");

  const [data, setData] = useState<TrackListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<Track | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);
  const debouncedTag = useDebouncedValue(tag, 350);

  const params = useMemo<ListTracksParams>(
    () => ({
      type: type === "all" ? undefined : type,
      q: debouncedSearch || undefined,
      tag: debouncedTag || undefined,
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
    }),
    [type, debouncedSearch, debouncedTag, page, sort, order]
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listTracks(params, signal);
        setData(res);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load library");
      } finally {
        setLoading(false);
      }
    },
    [params]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [type, debouncedSearch, debouncedTag]);

  const items = data?.items ?? [];
  const counts = data?.counts;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((t) => t.id))
    );
  };

  const changeSort = (col: string) => {
    if (sort === col) {
      setOrder((o) => (o === "ASC" ? "DESC" : "ASC"));
    } else {
      setSort(col);
      setOrder("ASC");
    }
  };

  const onBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} track(s)? This cannot be undone.`)) return;
    try {
      await bulkTracks({ action: "delete", trackIds: [...selected] });
      setSelected(new Set());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    }
  };

  const onBulkTag = async () => {
    if (selected.size === 0) return;
    const input = prompt("Tags to add (comma separated):");
    if (!input) return;
    const tags = input.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;
    try {
      await bulkTracks({ action: "tag", trackIds: [...selected], tags });
      setSelected(new Set());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk tag failed");
    }
  };

  const onDeleteOne = async (id: string) => {
    if (!confirm("Delete this track?")) return;
    try {
      await deleteTrack(id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="flex gap-6 p-6">
      {/* Sidebar: type filters + size */}
      <aside className="w-48 shrink-0 space-y-4">
        <div className="card p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
            Per type
          </div>
          <ul className="space-y-1 text-sm">
            {TYPE_TABS.map((t) => {
              const count =
                t.key === "all" ? counts?.all : counts?.[t.key as TrackType];
              return (
                <li key={t.key}>
                  <button
                    onClick={() => setType(t.key)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 ${
                      type === t.key
                        ? "bg-brand/15 text-brand"
                        : "text-slate-300 hover:bg-ink-700"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span className="text-xs text-slate-500">{count ?? "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card p-3">
          <label className="block text-xs font-semibold uppercase text-slate-400">
            Tag filter
          </label>
          <input
            className="input mt-1"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. classical"
          />
        </div>

        <div className="card p-3 text-sm text-slate-400">
          <div className="flex justify-between">
            <span>Total tracks</span>
            <span className="text-slate-200">{counts?.all ?? "—"}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Total size</span>
            <span className="text-slate-200">{formatSizeMb(data?.totalSizeMb)}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            className="input max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, artist, album…"
            aria-label="Search library"
          />
          <button onClick={() => setShowUpload(true)} className="btn-primary">
            ⇪ Upload tracks
          </button>
        </div>

        {/* Bulk toolbar */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">
            Selected ({selected.size})
          </span>
          <button
            className="btn-ghost px-2 py-1"
            disabled={selected.size !== 1}
            onClick={() => {
              const id = [...selected][0];
              const t = items.find((x) => x.id === id);
              if (t) setEditing(t);
            }}
          >
            Edit
          </button>
          <button
            className="btn-ghost px-2 py-1"
            disabled={selected.size === 0}
            onClick={onBulkTag}
          >
            Tag
          </button>
          <button
            className="btn-danger px-2 py-1"
            disabled={selected.size === 0}
            onClick={onBulkDelete}
          >
            Delete
          </button>
          <button className="btn-ghost px-2 py-1" onClick={() => load()}>
            ↻ Refresh
          </button>
          {loading && <Spinner />}
        </div>

        {error && (
          <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={items.length > 0 && selected.size === items.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="w-10 px-2 py-2" />
                <SortHeader label="Title" col="title" sort={sort} order={order} onSort={changeSort} />
                <SortHeader label="Artist" col="artist" sort={sort} order={order} onSort={changeSort} />
                <SortHeader label="Album" col="album" sort={sort} order={order} onSort={changeSort} />
                <SortHeader label="Duration" col="duration" sort={sort} order={order} onSort={changeSort} />
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-ink-700 hover:bg-ink-800/50"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.title}`}
                      checked={selected.has(t.id)}
                      onChange={() => toggleSelect(t.id)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded bg-ink-700 text-slate-500">
                      {t.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.artworkUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        "♪"
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-100">{t.title}</td>
                  <td className="px-3 py-2 text-slate-300">{t.artist || "—"}</td>
                  <td className="px-3 py-2 text-slate-400">{t.album || "Unknown"}</td>
                  <td className="px-3 py-2 text-slate-400">{formatDuration(t.duration)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={t.type === "song" ? "brand" : t.type === "jingle" ? "blue" : "amber"}>
                      {t.type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {(t.tags || []).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-slate-400 hover:text-slate-200"
                      onClick={() => setEditing(t)}
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      className="ml-2 text-slate-400 hover:text-red-400"
                      onClick={() => onDeleteOne(t.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    No tracks found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {total > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
              : "0 items"}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost px-2 py-1"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              className="btn-ghost px-2 py-1"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next ›
            </button>
          </div>
        </div>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => load()}
        />
      )}
      {editing && (
        <EditTrackModal
          track={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SortHeader({
  label,
  col,
  sort,
  order,
  onSort,
}: {
  label: string;
  col: string;
  sort: string;
  order: "ASC" | "DESC";
  onSort: (col: string) => void;
}) {
  const active = sort === col;
  return (
    <th className="px-3 py-2">
      <button
        className={`flex items-center gap-1 ${active ? "text-brand" : "hover:text-slate-200"}`}
        onClick={() => onSort(col)}
      >
        {label}
        {active && <span>{order === "ASC" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
