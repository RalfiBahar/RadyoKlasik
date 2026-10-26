import type { Role } from "./types";

// JWT storage for the studio. Since Phase 7 the server issues staff tokens that
// carry { sub, role, name }, so the role shown/guarded client-side is read
// from the token itself (the server enforces it on every request).

const TOKEN_KEY = "rk_studio_token";

const isBrowser = typeof window !== "undefined";

export function getToken(): string | null {
  if (!isBrowser) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (!isBrowser) return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  if (!isBrowser) return;
  window.localStorage.removeItem(TOKEN_KEY);
  // Pre-Phase-7 builds stored a client-picked role; drop it.
  window.localStorage.removeItem("rk_studio_role");
}

// Decode a JWT payload without verifying (display/expiry hints only).
export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp * 1000 < Date.now();
}

// Staff role carried by the token, or null (e.g. a legacy listener token).
export function roleFromToken(token: string | null): Role | null {
  if (!token) return null;
  const r = decodeJwt(token)?.role;
  return r === "admin" || r === "dj" || r === "guest" ? r : null;
}

export function nameFromToken(token: string | null): string | null {
  if (!token) return null;
  const n = decodeJwt(token)?.name;
  return typeof n === "string" ? n : null;
}
