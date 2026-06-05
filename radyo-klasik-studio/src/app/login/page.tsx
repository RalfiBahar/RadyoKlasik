"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { defaultSectionFor } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access to every panel" },
  { value: "dj", label: "DJ", hint: "Studio, library & dashboard" },
  { value: "guest", label: "Guest DJ", hint: "Studio access only" },
];

export default function LoginPage() {
  const { login, isAuthenticated, ready, role } = useAuth();
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("admin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const station = process.env.NEXT_PUBLIC_STATION_NAME || "Radyo Klasik";

  useEffect(() => {
    if (ready && isAuthenticated) {
      router.replace(`/${defaultSectionFor(role)}`);
    }
  }, [ready, isAuthenticated, role, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(secret, selectedRole);
      router.replace(`/${defaultSectionFor(selectedRole)}`);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message === "Unauthorized"
            ? "Invalid shared secret"
            : err.message
          : "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 p-6">
      <form
        onSubmit={onSubmit}
        className="card w-full max-w-sm space-y-5"
        aria-label="Studio login"
      >
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight text-brand">
            ◈ Radyo Klasik Studio
          </div>
          <p className="mt-1 text-sm text-slate-400">{station}</p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase text-slate-400">
            Shared secret
          </span>
          <input
            className="input"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter operator shared secret"
            autoFocus
            required
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase text-slate-400">
            Role
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                type="button"
                key={r.value}
                onClick={() => setSelectedRole(r.value)}
                className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                  selectedRole === r.value
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-ink-600 text-slate-300 hover:border-ink-600 hover:bg-ink-700"
                }`}
                aria-pressed={selectedRole === r.value}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {ROLES.find((r) => r.value === selectedRole)?.hint}
          </p>
        </fieldset>

        {error && (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
