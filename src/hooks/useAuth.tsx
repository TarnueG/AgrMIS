import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { setAccessToken, clearTokens } from '@/lib/api';
import { AuthUser, LoginResponse, RefreshResponse } from '@/types/auth';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: Error | null }>;
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

  const signIn = async (identifier: string, password: string): Promise<{ error: Error | null }> => {
    try {
      queryClient.clear();
      const data = await api.post<LoginResponse>('/auth/login', { identifier, password });
      setAccessToken(data.accessToken);
      localStorage.setItem('amis_refresh_token', data.refreshToken);
      setUser(data.user);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Login failed') };
    }
  };

  const signOut = () => {
    const refreshToken = localStorage.getItem('amis_refresh_token');
    api.post('/auth/logout', { refreshToken }).catch(() => {});
    clearTokens();
    setUser(null);
    queryClient.clear();
  };

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
