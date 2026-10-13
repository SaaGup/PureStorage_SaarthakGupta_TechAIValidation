import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, SESSION_EXPIRED_EVENT } from "../lib/api.js";

const AuthContext = createContext(null);

// Holds the signed-in user. The session itself lives in an httpOnly cookie that
// JavaScript cannot read; on load we ask the server who we are (/auth/me).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser((u) => {
        if (u) setNotice("Your session ended. Sign in again to continue.");
        return null;
      });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api("/auth/login", { method: "POST", body: { email, password } });
    setNotice(null);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  const can = useCallback((permission) => Boolean(user?.permissions?.includes(permission)), [user]);

  const value = useMemo(() => ({ user, checking, notice, login, logout, can }), [user, checking, notice, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);