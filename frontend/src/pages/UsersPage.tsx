import { useCallback, useEffect, useState } from 'react';
import { Database, Plus, UserCog, Pencil, Shield, Trash2 } from 'lucide-react';
import { adminBackupApi, authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/types';
import { APP_PAGES, formatRoleName, type PageKey } from '../lib/pages';

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  path: string;
}

interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions?: string[];
  userCount?: number;
}

interface PageOption {
  key: PageKey;
  path: string;
  label: string;
}

interface SystemUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  role: { id?: string; name: string };
  pages?: string[];
  allowedPages?: string[] | null;
  createdAt: string;
}

type Tab = 'users' | 'roles';

const emptyUserForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: '',
  roleId: '',
  useCustomPages: false,
  allowedPages: [] as PageKey[],
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UsersPage() {
  const { user: currentUser, canAccess } = useAuth();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pages, setPages] = useState<PageOption[]>(APP_PAGES.map(({ key, path, label }) => ({ key, path, label })));
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] as PageKey[] });
  const [backupDir, setBackupDir] = useState('');
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backingUp, setBackingUp] = useState(false);

  const load = () => {
    authApi.listUsers().then((res) => setUsers(res.data.data));
    authApi.listRoles().then((res) => setRoles(res.data.data));
    authApi.listPages().then((res) => setPages(res.data.data)).catch(() => {});
  };

  const loadBackups = useCallback(() => {
    if (!isSuperAdmin) return;
    adminBackupApi.list()
      .then((res) => {
        setBackupDir(res.data.data.hostHint || res.data.data.backupDir || '');
        setBackups(res.data.data.backups || []);
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => { load(); }, []);
  useEffect(() => { loadBackups(); }, [loadBackups]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const runBackup = async () => {
    if (!confirm('Create a full database backup now? This may take a minute.')) return;
    setBackingUp(true);
    setError('');
    try {
      const res = await adminBackupApi.create();
      const data = res.data.data as BackupFile & { hostHint?: string; backupDir?: string };
      setToast(`Backup saved: ${data.filename} (${formatBytes(data.sizeBytes)})`);
      setBackupDir(data.hostHint || data.backupDir || backupDir);
      loadBackups();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Database backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  if (!canAccess('users')) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">You do not have access to user management.</p>
      </div>
    );
  }

  const togglePage = (list: PageKey[], key: PageKey) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setError('');
    setShowUserForm(true);
  };

  const openEditUser = (u: SystemUser) => {
    const role = roles.find((r) => r.name === u.role.name || r.id === u.role.id);
    setEditingUser(u);
    setUserForm({
      email: u.email,
      password: '',
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone || '',
      roleId: role?.id || u.role.id || '',
      useCustomPages: u.allowedPages !== null && u.allowedPages !== undefined,
      allowedPages: (u.allowedPages || []) as PageKey[],
    });
    setError('');
    setShowUserForm(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload: Record<string, unknown> = {
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        phone: userForm.phone || undefined,
        roleId: userForm.roleId,
        allowedPages: userForm.useCustomPages ? userForm.allowedPages : null,
      };

      if (editingUser) {
        if (userForm.password) payload.password = userForm.password;
        await authApi.updateUser(editingUser.id, payload);
      } else {
        await authApi.createUser({
          ...payload,
          email: userForm.email,
          password: userForm.password,
        });
      }
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm(emptyUserForm);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to save user');
    }
  };

  const toggleUserActive = async (u: SystemUser) => {
    try {
      await authApi.updateUser(u.id, { isActive: !u.isActive });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      alert(msg || 'Failed to update user status');
    }
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: '', description: '', permissions: ['dashboard'] });
    setError('');
    setShowRoleForm(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      permissions: (role.permissions || []) as PageKey[],
    });
    setError('');
    setShowRoleForm(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingRole) {
        await authApi.updateRole(editingRole.id, {
          name: editingRole.name === 'SUPER_ADMIN' ? undefined : roleForm.name,
          description: roleForm.description || null,
          permissions: editingRole.name === 'SUPER_ADMIN' ? undefined : roleForm.permissions,
        });
      } else {
        await authApi.createRole({
          name: roleForm.name,
          description: roleForm.description || undefined,
          permissions: roleForm.permissions,
        });
      }
      setShowRoleForm(false);
      setEditingRole(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to save role');
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.name === 'SUPER_ADMIN') return;
    if (!confirm(`Delete role "${formatRoleName(role.name)}"? Users must be reassigned first.`)) return;
    try {
      await authApi.deleteRole(role.id);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      alert(msg || 'Failed to delete role');
    }
  };

  const PageChecklist = ({
    selected,
    onChange,
    disabled,
  }: {
    selected: PageKey[];
    onChange: (next: PageKey[]) => void;
    disabled?: boolean;
  }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {pages.map((p) => (
        <label
          key={p.key}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
            disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
          } ${selected.includes(p.key) ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={selected.includes(p.key)}
            onChange={() => onChange(togglePage(selected, p.key))}
          />
          {p.label}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="w-7 h-7 text-brand-600" />
            Users & Roles
          </h1>
          <p className="text-gray-500">Create users, roles, and assign page access</p>
        </div>
        <div className="flex gap-2">
          {tab === 'users' ? (
            <button onClick={openCreateUser} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create User
            </button>
          ) : (
            <button onClick={openCreateRole} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Role
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="bg-green-50 text-green-800 border border-green-200 rounded-lg px-4 py-2 text-sm">{toast}</div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      {isSuperAdmin && (
        <div className="card space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <Database className="w-5 h-5 text-brand-600" />
                Database backup
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Full backup saved on the server at{' '}
                <span className="font-mono text-gray-700">{backupDir || '/opt/ceylon-crm/backups'}</span>
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              disabled={backingUp}
              onClick={runBackup}
            >
              <Database className="w-4 h-4" />
              {backingUp ? 'Backing up...' : 'Backup now'}
            </button>
          </div>
          {backups.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left p-2">File</th>
                    <th className="text-left p-2">Created</th>
                    <th className="text-right p-2">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.slice(0, 10).map((b) => (
                    <tr key={b.filename} className="border-t">
                      <td className="p-2 font-mono text-xs">{b.filename}</td>
                      <td className="p-2">{formatDate(b.createdAt)}</td>
                      <td className="p-2 text-right">{formatBytes(b.sizeBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'users' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'
          }`}
        >
          Users
        </button>
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'roles' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'
          }`}
        >
          Roles
        </button>
      </div>

      {tab === 'users' && showUserForm && (
        <form onSubmit={handleSaveUser} className="card space-y-4">
          <h3 className="font-semibold">{editingUser ? 'Edit User' : 'New User'}</h3>
          {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input className="input" required value={userForm.firstName} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input className="input" required value={userForm.lastName} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                className="input"
                required
                disabled={!!editingUser}
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{editingUser ? 'New Password' : 'Password *'}</label>
              <input
                type="password"
                className="input"
                required={!editingUser}
                minLength={8}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder={editingUser ? 'Leave blank to keep current' : ''}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" required value={userForm.roleId} onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}>
                <option value="">Select role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{formatRoleName(r.name)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={userForm.useCustomPages}
                onChange={(e) => setUserForm({
                  ...userForm,
                  useCustomPages: e.target.checked,
                  allowedPages: e.target.checked
                    ? (roles.find((r) => r.id === userForm.roleId)?.permissions as PageKey[] | undefined) || ['dashboard']
                    : [],
                })}
              />
              Override page access for this user
            </label>
            <p className="text-xs text-gray-500">
              {userForm.useCustomPages
                ? 'Only the pages checked below will be available after login.'
                : 'User inherits page access from their role. Enable override to assign specific pages.'}
            </p>
            {userForm.useCustomPages && (
              <PageChecklist
                selected={userForm.allowedPages}
                onChange={(allowedPages) => setUserForm({ ...userForm, allowedPages })}
              />
            )}
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary">{editingUser ? 'Save Changes' : 'Create User'}</button>
            <button type="button" className="btn-secondary" onClick={() => { setShowUserForm(false); setEditingUser(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {tab === 'roles' && showRoleForm && (
        <form onSubmit={handleSaveRole} className="card space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {editingRole ? 'Edit Role' : 'New Role'}
          </h3>
          {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Role Name *</label>
              <input
                className="input"
                required
                disabled={editingRole?.name === 'SUPER_ADMIN'}
                value={roleForm.name}
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                placeholder="e.g. Workshop Lead"
              />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label mb-2 block">Assigned Pages</label>
            {editingRole?.name === 'SUPER_ADMIN' ? (
              <p className="text-sm text-gray-500">Super Admin always has access to every page.</p>
            ) : (
              <PageChecklist
                selected={roleForm.permissions}
                onChange={(permissions) => setRoleForm({ ...roleForm, permissions })}
              />
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">{editingRole ? 'Save Role' : 'Create Role'}</button>
            <button type="button" className="btn-secondary" onClick={() => { setShowRoleForm(false); setEditingRole(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {tab === 'users' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Pages</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Created</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium">{u.firstName} {u.lastName}</td>
                  <td className="py-3">{u.email}</td>
                  <td className="py-3">
                    <span className="badge bg-indigo-100 text-indigo-800">{formatRoleName(u.role.name)}</span>
                  </td>
                  <td className="py-3 text-xs text-gray-600 max-w-xs">
                    {u.role.name === 'SUPER_ADMIN' || (u.pages || []).length === pages.length
                      ? 'All pages'
                      : `${(u.pages || []).length} page${(u.pages || []).length === 1 ? '' : 's'}${
                          u.allowedPages ? ' (custom)' : ''
                        }`}
                  </td>
                  <td className="py-3">
                    <span className={`badge ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{formatDate(u.createdAt)}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary px-2 py-1 text-xs flex items-center gap-1" onClick={() => openEditUser(u)}>
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => toggleUserActive(u)}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'roles' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3">Role</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Pages</th>
                <th className="pb-3">Users</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium">{formatRoleName(role.name)}</td>
                  <td className="py-3 text-gray-600">{role.description || '—'}</td>
                  <td className="py-3 text-xs text-gray-600">
                    {role.name === 'SUPER_ADMIN' || (role.permissions || []).length === pages.length
                      ? 'All pages'
                      : (role.permissions || [])
                          .map((k) => pages.find((p) => p.key === k)?.label || k)
                          .join(', ') || 'None'}
                  </td>
                  <td className="py-3">{role.userCount ?? '—'}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary px-2 py-1 text-xs flex items-center gap-1" onClick={() => openEditRole(role)}>
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      {role.name !== 'SUPER_ADMIN' && (
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs flex items-center gap-1 text-red-600"
                          onClick={() => handleDeleteRole(role)}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
