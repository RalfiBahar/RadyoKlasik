"use client";

import { useState } from "react";
import { createGuest, deleteUser } from "@/lib/api";
import type { StaffUser } from "@/lib/types";
import { Badge, EmptyState, ErrorText, Field } from "@/components/ui";

// Value for <input type="datetime-local"> in the browser's local time.
function localInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Time-boxed guest DJ invites. The link opens the studio only, only inside
// the window, and stops working when revoked.
export default function GuestsPanel({
  users,
  onChanged,
}: {
  users: StaffUser[];
  onChanged: () => void;
}) {
  const now = new Date();
  const [name, setName] = useState("");
  const [from, setFrom] = useState(localInput(now));
  const [until, setUntil] = useState(localInput(new Date(now.getTime() + 3 * 3600000)));
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guests = users.filter((u) => u.role === "guest");

  const invite = async () => {
    setError(null);
    setLink(null);
    try {
      const res = await createGuest({
        name: name.trim(),
        accessFrom: new Date(from).toISOString(),
        accessUntil: new Date(until).toISOString(),
      });
      setLink(`${window.location.origin}/guest#${res.token}`);
      setName("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the link is selectable in the box.
    }
  };

  const revoke = async (u: StaffUser) => {
    if (!window.confirm(`Revoke ${u.displayName}'s guest access?`)) return;
    try {
      await deleteUser(u.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  const status = (u: StaffUser) => {
    const t = Date.now();
    if (u.accessUntil && new Date(u.accessUntil).getTime() < t) return <Badge>expired</Badge>;
    if (u.accessFrom && new Date(u.accessFrom).getTime() > t) return <Badge tone="amber">upcoming</Badge>;
    return <Badge tone="green">active</Badge>;
  };

  return (
    <section className="card space-y-3">
      <div>
        <div className="text-sm font-semibold text-slate-100">Guest DJs</div>
        <div className="text-xs text-slate-500">
          Send a one-off link that opens the studio for a limited time — no account needed.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
        <Field label="Guest name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Visiting pianist" />
        </Field>
        <Field label="From">
          <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Until">
          <input className="input" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <button className="btn-primary" onClick={invite} disabled={!name.trim()}>
          Create link
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
      {link && (
        <div className="flex items-center gap-2 rounded-md bg-ink-900 p-2">
          <input className="input font-mono text-xs" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
          <button className="btn-ghost" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {guests.length === 0 ? (
        <EmptyState>No guest invites.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Guest</th>
              <th>Window</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {guests.map((u) => (
              <tr key={u.id} className="border-t border-ink-700">
                <td className="py-2 text-slate-100">{u.displayName}</td>
                <td className="text-slate-400">
                  {fmt(u.accessFrom)} → {fmt(u.accessUntil)}
                </td>
                <td>{status(u)}</td>
                <td className="text-right">
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => revoke(u)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
