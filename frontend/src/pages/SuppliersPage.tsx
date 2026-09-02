import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { suppliersApi } from '../lib/api';
import { Supplier, formatDate } from '../lib/types';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });

  const load = () => {
    setLoading(true);
    suppliersApi.list({ search, limit: '200' })
      .then((res) => setSuppliers(res.data.data.suppliers))
      .catch(() => setError('Failed to load suppliers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' });
    setError('');
    setShowForm(true);
  };

  const openEdit = (row: Supplier) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      contactPerson: row.contactPerson || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      notes: row.notes || '',
    });
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId) {
        await suppliersApi.update(editingId, payload);
        setToast('Supplier updated');
      } else {
        await suppliersApi.create(payload);
        setToast('Supplier registered');
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save supplier');
    }
  };

  const handleDelete = async (row: Supplier) => {
    if (!confirm(`Delete supplier ${row.name}?`)) return;
    try {
      await suppliersApi.delete(row.id);
      setToast('Supplier deleted');
      load();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to delete supplier');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-gray-500">Register suppliers for payable expenses</p>
        </div>
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add supplier
        </button>
      </div>

      {(toast || error) && (
        <div className={`rounded-lg px-4 py-2 text-sm ${error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {error || toast}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Search name, code, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">Code</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Contact</th>
              <th className="text-left p-3">Phone</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Created</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">Loading...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No suppliers yet</td></tr>
            ) : suppliers.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3 font-mono text-xs">{row.supplierCode}</td>
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3">{row.contactPerson || '—'}</td>
                <td className="p-3">{row.phone || '—'}</td>
                <td className="p-3">{row.email || '—'}</td>
                <td className="p-3">{formatDate(row.createdAt)}</td>
                <td className="p-3 whitespace-nowrap">
                  <button type="button" className="text-brand-600 hover:underline text-xs mr-3 inline-flex items-center gap-1" onClick={() => openEdit(row)}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button type="button" className="text-red-600 hover:text-red-800 inline-flex" onClick={() => handleDelete(row)} title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit supplier' : 'Register supplier'}</h2>
              <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="label">Supplier name</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Contact person</label>
                <input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Update' : 'Save supplier'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
