import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getAuthToken, setAuthToken } from '../lib/api';
import type { User } from '../lib/types';

interface AuthResponse {
  token: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<AuthResponse>('/api/auth/login', { email, password });
    setAuthToken(res.token);
    setUser(res.user);
  }

  async function signup(email: string, password: string, name: string) {
    const res = await api.post<AuthResponse>('/api/auth/signup', { email, password, name });
    setAuthToken(res.token);
    setUser(res.user);
  }

  function logout() {
    setAuthToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
