import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../lib/api';
import { User } from '../lib/types';
import type { PageKey } from '../lib/pages';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  canAccess: (page: PageKey) => boolean;
  firstAccessiblePath: () => string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      authApi.profile()
        .then((res: { data: { data: User } }) => setUser(res.data.data))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const { user, accessToken, refreshToken } = res.data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setUser(user);
  };

  const logout = () => {
    const rt = localStorage.getItem('refreshToken');
    if (rt) authApi.logout(rt).catch(() => {});
    localStorage.clear();
    setUser(null);
  };

  const canAccess = (page: PageKey) => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    return (user.pages || []).includes(page);
  };

  const firstAccessiblePath = () => {
    if (!user) return '/login';
    if (user.role === 'SUPER_ADMIN' || (user.pages || []).includes('dashboard')) return '/';
    const order = [
      { key: 'customers' as const, path: '/customers' },
      { key: 'suppliers' as const, path: '/suppliers' },
      { key: 'employees' as const, path: '/employees' },
      { key: 'vehicles' as const, path: '/vehicles' },
      { key: 'leads' as const, path: '/leads' },
      { key: 'jobs' as const, path: '/jobs' },
      { key: 'register' as const, path: '/register' },
      { key: 'out-vehicles' as const, path: '/out-vehicles' },
      { key: 'inventory' as const, path: '/inventory' },
      { key: 'parts-sales' as const, path: '/parts-sales' },
      { key: 'insurance' as const, path: '/insurance' },
      { key: 'quotations' as const, path: '/quotations' },
      { key: 'invoices' as const, path: '/invoices' },
      { key: 'finance' as const, path: '/finance' },
      { key: 'ai' as const, path: '/ai' },
      { key: 'reports' as const, path: '/reports' },
      { key: 'attendance' as const, path: '/attendance' },
      { key: 'users' as const, path: '/users' },
    ];
    const pages = user.pages || [];
    const hit = order.find((p) => pages.includes(p.key));
    return hit?.path || '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccess, firstAccessiblePath }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
