import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CitizenRecord } from '../shared/types';
import { apiFetch, setStoredToken } from '../lib/api';

export interface PublicConfig {
  googleMapsApiKey: string;
  googleClientId: string;
  dbDriver: 'postgres' | 'sqlite' | 'vercel-json';
  hasGeminiKey: boolean;
}

interface AuthContextValue {
  citizen: CitizenRecord | null;
  loading: boolean;
  publicConfig: PublicConfig;
  setCitizenSession: (citizen: CitizenRecord | null, token?: string) => void;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [citizen, setCitizen] = useState<CitizenRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicConfig, setPublicConfig] = useState<PublicConfig>({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    dbDriver: 'sqlite',
    hasGeminiKey: false,
  });

  const refreshMe = useCallback(async () => {
    try {
      const [meRes, cfgRes] = await Promise.all([
        apiFetch<{ citizen: CitizenRecord | null }>('/api/auth/me'),
        apiFetch<PublicConfig>('/api/config/public'),
      ]);
      setCitizen(meRes.citizen);
      setPublicConfig((prev) => ({
        ...cfgRes,
        googleMapsApiKey: cfgRes.googleMapsApiKey || prev.googleMapsApiKey,
        googleClientId: cfgRes.googleClientId || prev.googleClientId,
      }));
    } catch {
      setCitizen(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const setCitizenSession = useCallback((next: CitizenRecord | null, token?: string) => {
    if (token) setStoredToken(token);
    setCitizen(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error during logout
    }
    setStoredToken(null);
    setCitizen(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ citizen, loading, publicConfig, setCitizenSession, refreshMe, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
