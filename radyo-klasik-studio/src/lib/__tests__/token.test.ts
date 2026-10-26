import { describe, expect, it } from "vitest";
import {
  clearAuth,
  decodeJwt,
  getToken,
  isExpired,
  nameFromToken,
  roleFromToken,
  setToken,
} from "@/lib/token";

// Build an unsigned JWT-shaped string with a given payload (header.payload.sig).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("token storage", () => {
  it("persists and clears the token", () => {
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
    clearAuth();
    expect(getToken()).toBeNull();
  });

  it("reads the role and name from the staff token", () => {
    const t = fakeJwt({ sub: "u1", role: "dj", name: "DJ Nova" });
    expect(roleFromToken(t)).toBe("dj");
    expect(nameFromToken(t)).toBe("DJ Nova");
  });

  it("a legacy roleless token (public shared secret) has no studio role", () => {
    expect(roleFromToken(fakeJwt({ iat: 1 }))).toBeNull();
    expect(roleFromToken(fakeJwt({ role: "superuser" }))).toBeNull();
    expect(roleFromToken(null)).toBeNull();
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
