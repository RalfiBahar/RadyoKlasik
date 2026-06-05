import { describe, expect, it } from "vitest";
import {
  clearAuth,
  decodeJwt,
  getRole,
  getToken,
  isExpired,
  setRole,
  setToken,
} from "@/lib/token";

// Build an unsigned JWT-shaped string with a given payload (header.payload.sig).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("token storage", () => {
  it("persists and reads token + role", () => {
    setToken("abc.def.ghi");
    setRole("dj");
    expect(getToken()).toBe("abc.def.ghi");
    expect(getRole()).toBe("dj");
  });

  it("clears auth", () => {
    setToken("abc.def.ghi");
    setRole("admin");
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getRole()).toBeNull();
  });

  it("rejects an unknown stored role", () => {
    localStorage.setItem("rk_studio_role", "superuser");
    expect(getRole()).toBeNull();
  });

  it("decodes a JWT payload", () => {
    const token = fakeJwt({ iat: 1, exp: 2, foo: "bar" });
    expect(decodeJwt(token)).toMatchObject({ foo: "bar" });
  });

  it("detects expiry from exp claim", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const future = Math.floor(Date.now() / 1000) + 600;
    expect(isExpired(fakeJwt({ exp: past }))).toBe(true);
    expect(isExpired(fakeJwt({ exp: future }))).toBe(false);
    // No exp -> treated as non-expiring.
    expect(isExpired(fakeJwt({}))).toBe(false);
  });
});
