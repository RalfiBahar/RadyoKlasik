"use client";

import { useRef, useState } from "react";
import { deleteArtwork, uploadArtwork } from "@/lib/api";
import type { ArtworkItem } from "@/lib/types";
import { EmptyState, ErrorText } from "@/components/ui";

// Grid of recording thumbnails. In "pick" mode clicking selects one; with
// `manage` admins can upload new artwork and delete unused ones.
export default function ArtworkPicker({
  items,
  selected,
  onSelect,
  manage = false,
  onChanged,
}: {
  items: ArtworkItem[];
  selected?: string | null;
  onSelect?: (file: string) => void;
  manage?: boolean;
  onChanged?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const res = await uploadArtwork(f);
        onSelect?.(res.file);
      }
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (file: string) => {
    if (!window.confirm("Delete this artwork?")) return;
    setError(null);
    try {
      await deleteArtwork(file);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && !manage ? (
        <EmptyState>No artwork yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
          {items.map((a) => (
            <div key={a.file} className="group relative">
              <button
                type="button"
                onClick={() => onSelect?.(a.file)}
                className={`block aspect-square w-full overflow-hidden rounded-md border-2 ${
                  selected === a.file ? "border-brand" : "border-transparent hover:border-ink-600"
                }`}
                aria-pressed={selected === a.file}
                title={a.usedBy ? `Used by ${a.usedBy} recording(s)` : "Not used yet"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="" className="h-full w-full object-cover" />
              </button>
              {manage && a.usedBy === 0 && (
                <button
                  type="button"
                  onClick={() => remove(a.file)}
                  className="absolute right-1 top-1 hidden rounded bg-black/70 px-1.5 text-xs text-red-300 group-hover:block"
                  aria-label="Delete artwork"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {manage && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-ink-600 text-2xl text-slate-500 hover:border-brand hover:text-brand"
              aria-label="Upload artwork"
            >
              {busy ? "…" : "+"}
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
