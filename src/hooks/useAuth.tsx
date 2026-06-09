import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { setAccessToken, clearTokens } from '@/lib/api';
import { AuthUser, LoginResponse, RefreshResponse } from '@/types/auth';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (identifier: string, password: string, loginType?: 'personnel' | 'customer') => Promise<{ error: Error | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // On mount: attempt silent token refresh if a refresh token is stored
  useEffect(() => {
    const refreshToken = localStorage.getItem('amis_refresh_token');
    if (!refreshToken) {
      setLoading(false);
      return;
    }

    fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data: RefreshResponse) => {
        setAccessToken(data.accessToken);
        setUser(data.user);
      })
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (identifier: string, password: string, loginType?: 'personnel' | 'customer'): Promise<{ error: Error | null }> => {
    try {
      queryClient.clear();
      const data = await api.post<LoginResponse>('/auth/login', { identifier, password, loginType });
      setAccessToken(data.accessToken);
      localStorage.setItem('amis_refresh_token', data.refreshToken);
      setUser(data.user);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Login failed') };
    }
  };

  // Clear local auth state only (no server call, no re-broadcast) — used when another tab logs out.
  const localLogout = () => {
    clearTokens();
    setUser(null);
    queryClient.clear();
  };

  const signOut = () => {
    const refreshToken = localStorage.getItem('amis_refresh_token');
    api.post('/auth/logout', { refreshToken }).catch(() => {});
    localLogout();
    // Cross-tab: a unique value guarantees other tabs receive the storage event.
    try { localStorage.setItem('amis_logout_ping', String(Date.now())); } catch { /* ignore */ }
  };

  // Cross-tab logout: when any tab logs out (idle or manual), other tabs drop to logged-out.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'amis_logout_ping') localLogout(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single idle controller (5 min, no warning): active only while authenticated. Activity
  // listeners are throttled; on timeout we end the session server-side and broadcast cross-tab.
  useEffect(() => {
    if (!user) return;
    const IDLE_MS = 5 * 60 * 1000;
    let timer = window.setTimeout(signOut, IDLE_MS);
    let last = 0;
    const reset = () => {
      const now = Date.now();
      if (now - last < 1000) return; // throttle to once/sec
      last = now;
      clearTimeout(timer);
      timer = window.setTimeout(signOut, IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
