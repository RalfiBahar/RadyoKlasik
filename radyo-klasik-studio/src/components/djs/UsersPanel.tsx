"use client";

import { useState } from "react";
import { createUser, deleteUser, updateUser } from "@/lib/api";
import type { StaffUser } from "@/lib/types";
import { Badge, EmptyState, ErrorText, Field, Modal } from "@/components/ui";

// DJ / admin accounts: create, rename, change role, disable, reset password,
// delete. (Guests are managed in GuestsPanel.)
export default function UsersPanel({
  users,
  onChanged,
}: {
  users: StaffUser[];
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const staff = users.filter((u) => u.role !== "guest");

  const toggleActive = async (u: StaffUser) => {
    setError(null);
    try {
      await updateUser(u.id, { active: !u.active });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">DJs & admins</div>
          <div className="text-xs text-slate-500">Each person signs in with their own account.</div>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + Add DJ
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
      {staff.length === 0 ? (
        <EmptyState>No DJ accounts yet. The station admin signs in with the server&apos;s admin login.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Shows</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className="border-t border-ink-700">
                <td className="py-2 text-slate-100">{u.displayName || u.username}</td>
                <td className="text-slate-400">{u.username}</td>
                <td>
                  <Badge tone={u.role === "admin" ? "brand" : "blue"}>{u.role}</Badge>
                </td>
                <td className="text-slate-400">
                  {u.shows.length ? u.shows.map((s) => s.title).join(", ") : "—"}
                </td>
                <td>
                  <button onClick={() => toggleActive(u)} title="Enable / disable sign-in">
                    <Badge tone={u.active ? "green" : "neutral"}>
                      {u.active ? "active" : "disabled"}
                    </Badge>
                  </button>
                </td>
                <td className="text-right">
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(u)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <UserModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            onChanged();
          }}
        />
      )}
      {editing && (
        <UserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user?: StaffUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user?.username || "");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [role, setRole] = useState<"admin" | "dj">(user?.role === "admin" ? "admin" : "dj");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (user) {
        await updateUser(user.id, {
          displayName: displayName || null,
          email: email || null,
          role,
          ...(password ? { password } : {}),
        });
      } else {
        await createUser({
          username: username.trim(),
          password,
          displayName: displayName || undefined,
          email: email || undefined,
          role,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!user || !window.confirm(`Delete ${user.displayName || user.username}?`)) return;
    try {
      await deleteUser(user.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <Modal
      title={user ? "Edit account" : "Add DJ"}
      onClose={onClose}
      footer={
        <>
          {user && (
            <button className="btn-danger mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <Field label="Username">
        <input
          className="input"
          value={username}
          disabled={!!user}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Display name" hint="Shown on air as the DJ name.">
        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Email (optional)">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Role">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "dj")}>
          <option value="dj">DJ — studio, library, playlists</option>
          <option value="admin">Admin — everything</option>
        </select>
      </Field>
      <Field
        label={user ? "New password (leave blank to keep)" : "Password"}
        hint="At least 8 characters."
      >
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
