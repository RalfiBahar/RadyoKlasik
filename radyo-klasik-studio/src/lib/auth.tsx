"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { generateToken } from "./api";
import {
  clearAuth,
  getRole,
  getToken,
  isExpired,
  setRole as persistRole,
  setToken as persistToken,
} from "./token";
import type { Role } from "./types";

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  ready: boolean;
  isAuthenticated: boolean;
  login: (sharedSecret: string, role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getToken();
    if (t && !isExpired(t)) {
      setTokenState(t);
      setRoleState(getRole());
    } else if (t) {
      clearAuth();
    }
    setReady(true);
  }, []);

  const login = async (sharedSecret: string, selectedRole: Role) => {
    const t = await generateToken(sharedSecret);
    persistToken(t);
    persistRole(selectedRole);
    setTokenState(t);
    setRoleState(selectedRole);
  };

  const logout = () => {
    clearAuth();
    setTokenState(null);
    setRoleState(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      role,
      ready,
      isAuthenticated: !!token,
      login,
      logout,
    }),
    [token, role, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
