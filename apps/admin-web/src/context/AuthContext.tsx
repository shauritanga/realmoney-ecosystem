import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '../api/client';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  kycStatus?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (identifier: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'rm_admin_token';
const USER_STORAGE_KEY = 'rm_admin_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  });

  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (identifier: string, password: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient<{ accessToken?: string; user?: AuthUser }>(
          '/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({ identifier: identifier.trim(), password }),
          }
        );

        if (data.accessToken) {
          const accessToken = data.accessToken;
          const authUser: AuthUser = data.user || {
            id: 'admin',
            fullName: 'Athanas Shauritanga',
            email: identifier,
            role: 'ADMIN',
          };

          setToken(accessToken);
          setUser(authUser);
          localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authUser));
          return true;
        } else {
          setError('Invalid username or password.');
          return false;
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to connect to authentication server.';
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }, []);

  // Synchronize state when storage changes (e.g. across tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) {
        setToken(e.newValue);
      }
      if (e.key === USER_STORAGE_KEY) {
        try {
          setUser(e.newValue ? JSON.parse(e.newValue) : null);
        } catch {
          setUser(null);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token),
        loading,
        error,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
