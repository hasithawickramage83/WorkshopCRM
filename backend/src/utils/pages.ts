/** Canonical CRM page keys used for role/user access control. */
export const APP_PAGES = [
  { key: 'dashboard', path: '/', label: 'Dashboard' },
  { key: 'customers', path: '/customers', label: 'Customers' },
  { key: 'suppliers', path: '/suppliers', label: 'Suppliers' },
  { key: 'employees', path: '/employees', label: 'Employees' },
  { key: 'labour-hours', path: '/labour-hours', label: 'Labour hours' },
  { key: 'vehicles', path: '/vehicles', label: 'Vehicles' },
  { key: 'leads', path: '/leads', label: 'Leads' },
  { key: 'jobs', path: '/jobs', label: 'Jobs' },
  { key: 'register', path: '/register', label: 'Job Registration' },
  { key: 'out-vehicles', path: '/out-vehicles', label: 'Out Vehicles' },
  { key: 'inventory', path: '/inventory', label: 'Inventory' },
  { key: 'parts-sales', path: '/parts-sales', label: 'Parts Sales' },
  { key: 'insurance', path: '/insurance', label: 'Insurance' },
  { key: 'quotations', path: '/quotations', label: 'Quotations' },
  { key: 'invoices', path: '/invoices', label: 'Invoices' },
  { key: 'finance', path: '/finance', label: 'Finance' },
  { key: 'ai', path: '/ai', label: 'AI Assistant' },
  { key: 'reports', path: '/reports', label: 'Reports' },
  { key: 'attendance', path: '/attendance', label: 'Attendance' },
  { key: 'whatsapp', path: '/whatsapp', label: 'WhatsApp' },
  { key: 'users', path: '/users', label: 'Users & Roles' },
] as const;

export type PageKey = (typeof APP_PAGES)[number]['key'];

export const ALL_PAGE_KEYS: PageKey[] = APP_PAGES.map((p) => p.key);

export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

const PAGE_KEY_SET = new Set<string>(ALL_PAGE_KEYS);

export function isValidPageKey(key: string): key is PageKey {
  return PAGE_KEY_SET.has(key);
}

export function sanitizePageKeys(pages: unknown): PageKey[] {
  if (!Array.isArray(pages)) return [];
  const unique = new Set<PageKey>();
  for (const item of pages) {
    if (typeof item === 'string' && isValidPageKey(item)) {
      unique.add(item);
    }
  }
  return ALL_PAGE_KEYS.filter((k) => unique.has(k));
}

export function parsePermissionList(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((p): p is string => typeof p === 'string');
}

/**
 * Resolve effective page keys for a user.
 * SUPER_ADMIN / ["*"] → all pages.
 * Non-null allowedPages on user → that list (even if empty).
 * Otherwise → role.permissions interpreted as page keys (legacy action strings ignored).
 */
export function resolveEffectivePages(
  roleName: string,
  rolePermissions: unknown,
  allowedPages: unknown,
): PageKey[] {
  if (roleName === SUPER_ADMIN_ROLE) {
    return [...ALL_PAGE_KEYS];
  }

  const rolePerms = parsePermissionList(rolePermissions);
  if (rolePerms.includes('*')) {
    return [...ALL_PAGE_KEYS];
  }

  if (allowedPages !== null && allowedPages !== undefined) {
    return sanitizePageKeys(allowedPages);
  }

  return sanitizePageKeys(rolePerms);
}

export function hasPageAccess(pages: string[], pageKey: PageKey): boolean {
  return pages.includes(pageKey);
}
