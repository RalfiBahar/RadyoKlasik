"use client";

import { useCallback, useEffect, useState } from "react";
import { addToQueue, listTracks } from "@/lib/api";
import type { Track, TrackType } from "@/lib/types";
import { useDebouncedValue } from "@/lib/hooks";
import { formatDuration } from "@/lib/format";

type TypeFilter = "all" | TrackType;
const TABS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "song", label: "Songs" },
  { key: "jingle", label: "Jingles" },
  { key: "commercial", label: "Commercials" },
];

// Left "Stations library" panel: browse + search + add to queue / play next.
export default function LibraryBrowser({
  onQueued,
}: {
  onQueued?: () => void;
}) {
  const [type, setType] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounced = useDebouncedValue(search, 300);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await listTracks(
          {
            type: type === "all" ? undefined : type,
            q: debounced || undefined,
            pageSize: 100,
            sort: "title",
            order: "ASC",
          },
          signal
        );
        setTracks(res.items);
      } catch {
        // best-effort
      }
    },
    [type, debounced]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const enqueue = async (track: Track, playNext: boolean) => {
    setBusyId(track.id);
    try {
      await addToQueue(playNext ? { trackId: track.id, position: 0 } : { trackId: track.id });
      onQueued?.();
    } catch {
      // best-effort
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-700 p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
          Stations library
        </div>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          aria-label="Search studio library"
        />
        <div className="mt-2 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`rounded px-2 py-1 text-xs ${
                type === t.key
                  ? "bg-brand text-white"
                  : "bg-ink-700 text-slate-300 hover:bg-ink-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto scroll-thin">
        {tracks.map((t) => (
          <li
            key={t.id}
            className="group flex items-center gap-2 border-b border-ink-800 px-3 py-2 hover:bg-ink-800/60"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-slate-100">{t.title}</div>
              <div className="truncate text-xs text-slate-500">
                {t.artist || "—"} · {formatDuration(t.duration)}
              </div>
            </div>
            <button
              className="btn-ghost px-2 py-1 text-xs"
              disabled={busyId === t.id}
              onClick={() => enqueue(t, true)}
              title="Play next"
              aria-label={`Play next ${t.title}`}
            >
              ⏭
            </button>
            <button
              className="btn-primary px-2 py-1 text-xs"
              disabled={busyId === t.id}
              onClick={() => enqueue(t, false)}
              title="Add to queue"
              aria-label={`Add ${t.title} to queue`}
            >
              + Add
            </button>
          </li>
        ))}
        {tracks.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-slate-500">
            No tracks.
          </li>
        )}
      </ul>
    </div>
  );
}
