/**
 * Signed-in user. The access token lives in localStorage (tokenStore); the user is read from
 * /auth/me on load. A 401 anywhere clears the session through the SESSION_EXPIRED event.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from '../api/endpoints';
import { SESSION_EXPIRED, tokenStore } from '../api/http';
import type { Session, User } from '../api/types';

export const STAFF_ROLES = ['operator', 'auditor', 'admin'] as const;

interface AuthValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isStaff: boolean;
  login(email: string, password: string): Promise<User>;
  loginWithGoogle(idToken: string): Promise<User>;
  linkGoogle(idToken: string): Promise<User>;
  register(input: { email: string; password: string; displayName: string; handle?: string }): Promise<User>;
  /** Stores a session returned by reset or change password. */
  adopt(session: Session): User;
  updateUser(user: User): void;
  refreshUser(): Promise<User | null>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const adopt = useCallback((s: Session) => {
    tokenStore.set(s.token);
    setUser(s.user);
    return s.user;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      return null;
    }
    try {
      const { user: u } = await auth.me();
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshUser().finally(() => setLoading(false));
    const expired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, [refreshUser]);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    isAuthenticated: user !== null,
    isStaff: user !== null && (STAFF_ROLES as readonly string[]).includes(user.role),
    login: async (email, password) => adopt(await auth.login({ email, password })),
    loginWithGoogle: async (idToken) => adopt(await auth.google(idToken)),
    linkGoogle: async (idToken) => {
      const { user: u } = await auth.linkGoogle(idToken);
      setUser(u);
      return u;
    },
    register: async (input) => adopt(await auth.register(input)),
    adopt,
    updateUser: setUser,
    refreshUser,
    // Sign-out revokes every token of the account on the server; the local session goes
    // first so a network error never keeps someone signed in.
    logout: async () => {
      const hadToken = tokenStore.get() !== null;
      try {
        if (hadToken) await auth.logout();
      } catch { /* already signed out locally below */ }
      tokenStore.set(null);
      setUser(null);
    },
  }), [user, loading, adopt, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
