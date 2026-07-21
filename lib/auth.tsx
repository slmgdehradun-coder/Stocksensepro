'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SubscriptionStatus, UserRole } from '@/lib/subscription';

export interface ClientUser {
  id: string;
  name: string;
  mobile: string;
  email: string;
  role: UserRole;
  status: SubscriptionStatus;
  effectiveStatus: SubscriptionStatus;
  isPro: boolean;
  remainingProDays: number;
  proStartDate?: string;
  proEndDate?: string;
  proActiveDates: string[];
  disclaimerAcceptedAt?: string;
  createdAt: string;
}

export interface SignupPayload {
  name: string;
  mobile: string;
  email: string;
  password: string;
  acceptedDisclaimer: boolean;
}

interface AuthContextType {
  user: ClientUser | null;
  isLoaded: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  googleLogin: (credential: string, acceptedDisclaimer: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function readApiError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error || `Request failed with ${response.status}`;
}

async function fetchCurrentUser() {
  const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  return payload.user || null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUser(await fetchCurrentUser());
    } catch {
      setUser(null);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) throw new Error(await readApiError(response));
    await response.json();
    const verifiedUser = await fetchCurrentUser();
    if (!verifiedUser) throw new Error('Login session could not be verified. Please try again.');
    setUser(verifiedUser);
    setIsLoaded(true);
  }, []);

  const signup = useCallback(async (payload: SignupPayload) => {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(await readApiError(response));
    await response.json();
    const verifiedUser = await fetchCurrentUser();
    if (!verifiedUser) throw new Error('Signup session could not be verified. Please sign in.');
    setUser(verifiedUser);
    setIsLoaded(true);
  }, []);

  const googleLogin = useCallback(async (credential: string, acceptedDisclaimer: boolean) => {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, acceptedDisclaimer }),
    });

    if (!response.ok) throw new Error(await readApiError(response));
    await response.json();
    const verifiedUser = await fetchCurrentUser();
    if (!verifiedUser) throw new Error('Google session could not be verified. Please try again.');
    setUser(verifiedUser);
    setIsLoaded(true);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => null);
    setUser(null);
    setIsLoaded(true);
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isLoaded,
    login,
    signup,
    googleLogin,
    logout,
    refresh,
  }), [googleLogin, isLoaded, login, logout, refresh, signup, user]);

  return (
    <AuthContext.Provider value={value}>
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
