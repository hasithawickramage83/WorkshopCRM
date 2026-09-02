import {
  LayoutDashboard, Users, Car, UserPlus, Wrench, ClipboardList, Boxes, Package,
  Shield, FileText, Receipt, Wallet, Bot, BarChart3, Clock, UserCog, CarFront, MessageCircle, Truck, HardHat, type LucideIcon,
} from 'lucide-react';

export type PageKey =
  | 'dashboard'
  | 'customers'
  | 'suppliers'
  | 'employees'
  | 'vehicles'
  | 'leads'
  | 'jobs'
  | 'register'
  | 'out-vehicles'
  | 'inventory'
  | 'parts-sales'
  | 'insurance'
  | 'quotations'
  | 'invoices'
  | 'finance'
  | 'ai'
  | 'reports'
  | 'attendance'
  | 'whatsapp'
  | 'users';

export interface AppPage {
  key: PageKey;
  path: string;
  label: string;
  icon: LucideIcon;
}

export const APP_PAGES: AppPage[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'customers', path: '/customers', label: 'Customers', icon: Users },
  { key: 'suppliers', path: '/suppliers', label: 'Suppliers', icon: Truck },
  { key: 'employees', path: '/employees', label: 'Employees', icon: HardHat },
  { key: 'vehicles', path: '/vehicles', label: 'Vehicles', icon: Car },
  { key: 'leads', path: '/leads', label: 'Leads', icon: UserPlus },
  { key: 'jobs', path: '/jobs', label: 'Jobs', icon: Wrench },
  { key: 'register', path: '/register', label: 'Job Registration', icon: ClipboardList },
  { key: 'out-vehicles', path: '/out-vehicles', label: 'Out Vehicles', icon: CarFront },
  { key: 'inventory', path: '/inventory', label: 'Inventory', icon: Boxes },
  { key: 'parts-sales', path: '/parts-sales', label: 'Parts Sales', icon: Package },
  { key: 'insurance', path: '/insurance', label: 'Insurance', icon: Shield },
  { key: 'quotations', path: '/quotations', label: 'Quotations', icon: FileText },
  { key: 'invoices', path: '/invoices', label: 'Invoices', icon: Receipt },
  { key: 'finance', path: '/finance', label: 'Finance', icon: Wallet },
  { key: 'ai', path: '/ai', label: 'AI Assistant', icon: Bot },
  { key: 'reports', path: '/reports', label: 'Reports', icon: BarChart3 },
  { key: 'attendance', path: '/attendance', label: 'Attendance', icon: Clock },
  { key: 'whatsapp', path: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'users', path: '/users', label: 'Users & Roles', icon: UserCog },
];

export const PAGE_BY_PATH = Object.fromEntries(APP_PAGES.map((p) => [p.path, p])) as Record<string, AppPage>;

export function formatRoleName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
