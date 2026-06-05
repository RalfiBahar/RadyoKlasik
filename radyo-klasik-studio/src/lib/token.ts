import type { Role } from "./types";

// Lightweight JWT/role storage. The control-plane (Phase 0–4) issues a JWT from
// POST /auth/generate_token with an EMPTY payload (no role claim yet — real
// role-based backend auth is Phase 7). So Phase 5 stores the operator's chosen
// role alongside the token and enforces route guards client-side.

const TOKEN_KEY = "rk_studio_token";
const ROLE_KEY = "rk_studio_role";

const isBrowser = typeof window !== "undefined";

export function getToken(): string | null {
  if (!isBrowser) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (!isBrowser) return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getRole(): Role | null {
  if (!isBrowser) return null;
  const r = window.localStorage.getItem(ROLE_KEY);
  return r === "admin" || r === "dj" || r === "guest" ? r : null;
}

export function setRole(role: Role): void {
  if (!isBrowser) return;
  window.localStorage.setItem(ROLE_KEY, role);
}

export function clearAuth(): void {
  if (!isBrowser) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);
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
