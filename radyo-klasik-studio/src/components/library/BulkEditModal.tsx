"use client";

import { useState } from "react";
import { bulkTracks } from "@/lib/api";
import type { TrackType } from "@/lib/types";
import { ErrorText, Field, Modal } from "@/components/ui";

const FIELDS = [
  { key: "composer", label: "Composer" },
  { key: "artist", label: "Artist / performer" },
  { key: "album", label: "Album" },
  { key: "genre", label: "Genre" },
  { key: "year", label: "Year" },
] as const;

// Set the same metadata on many tracks at once. Only the fields you tick are
// changed; everything else on each track is left alone.
export default function BulkEditModal({
  trackIds,
  onClose,
  onSaved,
}: {
  trackIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [type, setType] = useState<TrackType | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => {
    setValues((p) => ({ ...p, [k]: v }));
    setEnabled((p) => ({ ...p, [k]: true }));
  };

  const save = async () => {
    const fields: Record<string, unknown> = {};
    for (const f of FIELDS) {
      if (enabled[f.key]) fields[f.key] = f.key === "year" ? (values.year ? Number(values.year) : null) : values[f.key] || "";
    }
    if (type) fields.type = type;
    if (!Object.keys(fields).length) {
      setError("Tick at least one field to change");
      return;
    }
    if (enabled.year && values.year && !/^\d{1,4}$/.test(values.year)) {
      setError("Year must be a number");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await bulkTracks({ action: "update", trackIds, fields });
      if (res.fileErrors) {
        window.alert(`${res.affected} tracks updated. ${res.fileErrors} file(s) couldn't have their embedded tags rewritten.`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Edit ${trackIds.length} tracks`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Updating…" : `Update ${trackIds.length} tracks`}
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-500">
        Tick the fields to overwrite on every selected track. Leave a ticked field empty to clear it.
      </p>
      {FIELDS.map((f) => (
        <div key={f.key} className="flex items-end gap-2">
          <input
            type="checkbox"
            className="mb-3"
            checked={!!enabled[f.key]}
            onChange={(e) => setEnabled((p) => ({ ...p, [f.key]: e.target.checked }))}
            aria-label={`Change ${f.label}`}
          />
          <div className="flex-1">
            <Field label={f.label}>
              <input
                className="input"
                value={values[f.key] || ""}
                inputMode={f.key === "year" ? "numeric" : undefined}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </Field>
          </div>
        </div>
      ))}
      <Field label="Type">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as TrackType | "")}>
          <option value="">— leave unchanged —</option>
          <option value="song">song</option>
          <option value="jingle">jingle</option>
          <option value="commercial">commercial</option>
        </select>
      </Field>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
