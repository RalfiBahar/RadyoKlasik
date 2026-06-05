"use client";

import { useRef, useState } from "react";
import { uploadTrack, ApiError } from "@/lib/api";
import type { Track, TrackType } from "@/lib/types";

interface PendingFile {
  file: File;
  status: "queued" | "uploading" | "done" | "error" | "duplicate";
  progress: number;
  message?: string;
}

const TYPES: TrackType[] = ["song", "jingle", "commercial"];

export default function UploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [type, setType] = useState<TrackType>("song");
  const [tags, setTags] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const audio = Array.from(list).filter(
      (f) => f.type.startsWith("audio") || /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(f.name)
    );
    setFiles((prev) => [
      ...prev,
      ...audio.map((file) => ({
        file,
        status: "queued" as const,
        progress: 0,
      })),
    ]);
  };

  const updateFile = (idx: number, patch: Partial<PendingFile>) => {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const startUpload = async () => {
    if (files.length === 0) return;
    setBusy(true);
    let anySuccess = false;
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "done") continue;
      const fd = new FormData();
      fd.append("file", files[i].file);
      fd.append("type", type);
      if (tags.trim()) fd.append("tags", tags.trim());
      updateFile(i, { status: "uploading", progress: 0, message: undefined });
      try {
        const track: Track = await uploadTrack(fd, (pct) =>
          updateFile(i, { progress: pct })
        );
        anySuccess = true;
        updateFile(i, {
          status: "done",
          progress: 100,
          message: track.title || undefined,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          updateFile(i, { status: "duplicate", message: "Already in library" });
        } else {
          updateFile(i, {
            status: "error",
            message: err instanceof Error ? err.message : "Upload failed",
          });
        }
      }
    }
    setBusy(false);
    if (anySuccess) onUploaded();
  };

  const allDone =
    files.length > 0 &&
    files.every((f) => ["done", "duplicate", "error"].includes(f.status));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Upload tracks"
    >
      <div className="card w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upload tracks</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex-1 space-y-1">
            <span className="text-xs uppercase text-slate-400">Type</span>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as TrackType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-xs uppercase text-slate-400">Tags (comma sep)</span>
            <input
              className="input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="classical, relaxing"
            />
          </label>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-brand bg-brand/10" : "border-ink-600 hover:border-ink-600"
          }`}
          data-testid="dropzone"
        >
          <div className="text-3xl text-slate-500">⇪</div>
          <p className="mt-2 text-sm text-slate-300">
            Drag &amp; drop audio here, or click to browse
          </p>
          <p className="text-xs text-slate-500">MP3, AAC, OGG, WAV, FLAC</p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
            data-testid="file-input"
          />
        </div>

        {files.length > 0 && (
          <ul className="max-h-48 space-y-2 overflow-y-auto scroll-thin">
            {files.map((f, i) => (
              <li key={i} className="rounded-md bg-ink-900 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-200">{f.file.name}</span>
                  <StatusTag status={f.status} />
                </div>
                {f.status === "uploading" && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-ink-700">
                    <div
                      className="h-full bg-brand transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.message && (
                  <div className="mt-1 text-xs text-slate-500">{f.message}</div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            {allDone ? "Close" : "Cancel"}
          </button>
          <button
            onClick={startUpload}
            className="btn-primary"
            disabled={busy || files.length === 0}
          >
            {busy ? "Uploading…" : `Upload ${files.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: PendingFile["status"] }) {
  const map: Record<PendingFile["status"], { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "text-slate-400" },
    uploading: { label: "Uploading", cls: "text-brand" },
    done: { label: "Done", cls: "text-emerald-400" },
    duplicate: { label: "Duplicate", cls: "text-amber-400" },
    error: { label: "Error", cls: "text-red-400" },
  };
  const { label, cls } = map[status];
  return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
}
