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
          // Add a timeout so we don't hang forever if server is unreachable
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          
          const response = await api.get<User>('/auth/me', {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          setUser(response.data);
        } catch (error: any) {
          console.error('Failed to load user:', error);
          if (error?.name === 'AbortError' || error?.code === 'ECONNABORTED') {
            console.warn('Auth check timed out — server may be unreachable');
          }
          localStorage.removeItem('authToken');
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
      console.error('Login failed:', error);
      localStorage.removeItem('authToken');
      throw error;
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
