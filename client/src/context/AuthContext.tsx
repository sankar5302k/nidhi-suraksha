import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthenticatedUser, UserRole } from '../types.js';
import { apiRequest } from '../api/client.js';

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

  // Verifies the session cookie with the server via /auth/me
  const refreshUser = async () => {
    try {
      const res = await apiRequest<{ user: AuthenticatedUser }>('/auth/me');
      if (res && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  // Performs real cookie-based authentication via POST /auth/login with gateway validation
  const login = async (email: string, pass: string, gatewayRole?: UserRole): Promise<AuthenticatedUser> => {
    const payload: { email: string; password: string; gatewayRole?: UserRole } = {
      email,
      password: pass
    };
    if (gatewayRole) {
      payload.gatewayRole = gatewayRole;
    }

    const res = await apiRequest<{ user: AuthenticatedUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setUser(res.user);
    return res.user;
  };

  // Clears the httpOnly session cookies via POST /auth/logout
  const logout = async () => {
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
