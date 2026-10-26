"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { defaultSectionFor } from "@/lib/permissions";

export default function LoginPage() {
  const { login, isAuthenticated, ready, role } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      const r = await login(username.trim(), password);
      router.replace(`/${defaultSectionFor(r)}`);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message === "Unauthorized"
            ? "Invalid username or password"
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
          <span className="text-xs font-medium uppercase text-slate-400">Username</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase text-slate-400">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-xs text-slate-500">
          Guest DJs: open the invite link you were sent.
        </p>
      </form>
    </div>
  );
}
