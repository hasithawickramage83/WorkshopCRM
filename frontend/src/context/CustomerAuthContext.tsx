import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { customerPortalApi } from '../lib/api';

export interface CustomerSession {
  customer: {
    id: string;
    name: string;
    companyName?: string;
    phone?: string;
    email?: string;
    address?: string;
    customerCode: string;
    customerType: string;
  };
  vehicle: {
    id: string;
    registrationNo: string;
    make: string;
    model: string;
    year?: number;
    colour?: string;
  };
}

interface CustomerAuthContextType {
  session: CustomerSession | null;
  loading: boolean;
  login: (registrationNo: string) => Promise<void>;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('customerToken');
    const stored = localStorage.getItem('customerSession');
    if (token && stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {
        localStorage.removeItem('customerToken');
        localStorage.removeItem('customerSession');
      }
    }
    setLoading(false);
  }, []);

  const login = async (registrationNo: string) => {
    const res = await customerPortalApi.login(registrationNo);
    const { accessToken, customer, vehicle } = res.data.data;
    const sessionData = { customer, vehicle };
    localStorage.setItem('customerToken', accessToken);
    localStorage.setItem('customerSession', JSON.stringify(sessionData));
    setSession(sessionData);
  };

  const logout = () => {
    localStorage.removeItem('customerToken');
    localStorage.removeItem('customerSession');
    setSession(null);
  };

  return (
    <CustomerAuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
