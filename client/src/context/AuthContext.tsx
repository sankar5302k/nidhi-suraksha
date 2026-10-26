import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthenticatedUser, UserRole } from '../types.js';
import { apiRequest, setStoredToken } from '../api/client.js';

interface AuthContextType {
  user: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string, password: string, gatewayRole?: UserRole) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Verifies the session cookie or Bearer token with the server via /auth/me
  const refreshUser = async () => {
    try {
      const res = await apiRequest<{ user: AuthenticatedUser }>('/auth/me');
      if (res && res.user) {
        setUser(res.user);
      } else {
        setStoredToken(null);
        setUser(null);
      }
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  // Performs authentication via POST /auth/login with token storage and cookie fallback
  const login = async (email: string, pass: string, gatewayRole?: UserRole): Promise<AuthenticatedUser> => {
    const payload: { email: string; password: string; gatewayRole?: UserRole } = {
      email,
      password: pass
    };
    if (gatewayRole) {
      payload.gatewayRole = gatewayRole;
    }

    const res = await apiRequest<{ user: AuthenticatedUser; accessToken?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.accessToken) {
      setStoredToken(res.accessToken);
    }

    setUser(res.user);
    return res.user;
  };

  // Clears the stored session token and cookies via POST /auth/logout
  const logout = async () => {
    setStoredToken(null);
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Continue clearing local state
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
