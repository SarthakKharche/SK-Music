import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../utils/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  connectSpotify: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Load user on mount
   */
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('authToken');
      
      if (token) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          
          const response = await api.get<User>('/auth/me', {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          setUser(response.data);
        } catch (error: any) {
          console.warn('Failed to load /auth/me on init, decoding stored token:', error);
          try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
              atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
            );
            const decoded = JSON.parse(jsonPayload);
            setUser({
              uid: decoded.uid,
              email: decoded.email,
              name: decoded.email ? decoded.email.split('@')[0] : 'User',
              picture: '',
              provider: 'google',
              spotifyConnected: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          } catch {
            localStorage.removeItem('authToken');
          }
        }
      }
      
      setLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Login with token
   */
  const login = async (token: string): Promise<void> => {
    localStorage.setItem('authToken', token);
    
    try {
      const response = await api.get<User>('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.warn('Failed to fetch /auth/me, decoding token directly:', error);
      try {
        // Decode JWT payload directly (base64url)
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        setUser({
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.email ? decoded.email.split('@')[0] : 'User',
          picture: '',
          provider: 'google',
          spotifyConnected: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        localStorage.removeItem('authToken');
        throw error;
      }
    }
  };

  /**
   * Logout
   */
  const logout = async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      localStorage.removeItem('authToken');
      setUser(null);
    }
  };

  /**
   * Initiate Spotify OAuth
   */
  const connectSpotify = async (): Promise<void> => {
    try {
      const response = await api.get<{ authUrl: string }>('/auth/spotify');
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Failed to connect Spotify:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    connectSpotify,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Custom hook to use auth context
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
