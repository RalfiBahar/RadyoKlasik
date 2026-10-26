"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { studioLogin } from "./api";
import {
  clearAuth,
  getToken,
  isExpired,
  nameFromToken,
  roleFromToken,
  setToken as persistToken,
} from "./token";
import type { Role } from "./types";

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  name: string | null;
  ready: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<Role | null>;
  // Guest invite links carry a ready-made token.
  loginWithToken: (token: string) => Role | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getToken();
    // Only staff tokens (with a role) are usable here; anything else (expired,
    // or a pre-Phase-7 roleless token) sends the user back to the login page.
    if (t && !isExpired(t) && roleFromToken(t)) {
      setTokenState(t);
    } else if (t) {
      clearAuth();
    }
    setReady(true);
  }, []);

  const adopt = (t: string): Role | null => {
    const role = roleFromToken(t);
    if (!role) throw new Error("This account has no studio access");
    persistToken(t);
    setTokenState(t);
    return role;
  };

  const login = async (username: string, password: string) =>
    adopt(await studioLogin(username, password));

  const loginWithToken = (t: string) => {
    if (isExpired(t)) throw new Error("This invite link has expired");
    return adopt(t);
  };

  const logout = () => {
    clearAuth();
    setTokenState(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      role: roleFromToken(token),
      name: nameFromToken(token),
      ready,
      isAuthenticated: !!token,
      login,
      loginWithToken,
      logout,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
