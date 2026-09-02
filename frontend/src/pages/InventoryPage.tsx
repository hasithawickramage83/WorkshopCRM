import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Search } from 'lucide-react';
import { inventoryApi } from '../lib/api';
import {
  formatCurrency, formatCompany, formatPartCategory,
  BUSINESS_COMPANIES, PART_CATEGORIES,
} from '../lib/types';

interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  company: string;
  partCategory: string;
  vehicleMake?: string;
  vehicleModel?: string;
  description?: string;
  costPrice: number | string;
  sellingPrice: number | string;
  quantity: number;
  createdAt: string;
}

const emptyForm = {
  itemName: '',
  company: 'CEYLON_AUTOMOBILE',
  partCategory: 'BUMPER',
  vehicleMake: '',
  vehicleModel: '',
  description: '',
  costPrice: '',
  sellingPrice: '',
  quantity: '0',
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState('');

  const load = () => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    inventoryApi.list(params).then((res) => setItems(res.data.data.items));
  };

  useEffect(() => { load(); }, [search]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({
      itemName: item.itemName,
      company: item.company || 'CEYLON_AUTOMOBILE',
      partCategory: item.partCategory,
      vehicleMake: item.vehicleMake || '',
      vehicleModel: item.vehicleModel || '',
      description: item.description || '',
      costPrice: String(item.costPrice),
      sellingPrice: String(item.sellingPrice),
      quantity: String(item.quantity),
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      itemName: form.itemName,
      company: form.company,
      partCategory: form.partCategory,
      vehicleMake: form.vehicleMake || undefined,
      vehicleModel: form.vehicleModel || undefined,
      description: form.description || undefined,
      costPrice: parseFloat(form.costPrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      quantity: parseInt(form.quantity) || 0,
    };
    try {
      if (editingId) {
        await inventoryApi.update(editingId, payload);
        setToast('Item updated');
      } else {
        await inventoryApi.create(payload);
        setToast('Item added to inventory');
      }
      setShowForm(false);
      load();
    } catch {
      setToast('Failed to save item');
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!confirm(`Delete inventory item ${item.itemCode} — ${item.itemName}?`)) return;
    try {
      await inventoryApi.delete(item.id);
      setToast('Item deleted');
      load();
    } catch {
      setToast('Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Parts Inventory</h1>
          <p className="text-gray-500">Manage stock — body kits, lights, bumpers and other parts</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {toast && <div className="bg-brand-50 text-brand-800 px-4 py-3 rounded-lg text-sm">{toast}</div>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-10" placeholder="Search by name, make, model..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">{editingId ? 'Edit Inventory Item' : 'New Inventory Item'}</h3>
            <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="label">Item Name *</label>
              <input className="input" required placeholder="e.g. Front Bumper" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
            </div>
            <div>
              <label className="label">Company *</label>
              <select className="input" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                {BUSINESS_COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input" required value={form.partCategory} onChange={(e) => setForm({ ...form, partCategory: e.target.value })}>
                {PART_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vehicle Make</label>
              <input className="input" placeholder="Toyota" value={form.vehicleMake} onChange={(e) => setForm({ ...form, vehicleMake: e.target.value })} />
            </div>
            <div>
              <label className="label">Vehicle Model</label>
              <input className="input" placeholder="Corolla" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
            </div>
            <div>
              <label className="label">Cost Price (NZD) *</label>
              <input type="number" min="0" step="0.01" className="input" required value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </div>
            <div>
              <label className="label">Selling Price (NZD) *</label>
              <input type="number" min="0" step="0.01" className="input" required value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
            </div>
            <div>
              <label className="label">Current Qty *</label>
              <input type="number" min="0" className="input" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Add to Inventory'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 font-medium">Code</th>
              <th className="pb-3 font-medium">Item</th>
              <th className="pb-3 font-medium">Category</th>
              <th className="pb-3 font-medium">Make / Model</th>
              <th className="pb-3 font-medium">Company</th>
              <th className="pb-3 font-medium">Cost</th>
              <th className="pb-3 font-medium">Sell Price</th>
              <th className="pb-3 font-medium">Qty</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">No inventory items — add your first part</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-mono text-xs">{item.itemCode}</td>
                  <td className="py-3 font-medium">
                    {item.itemName}
                    {item.description && <span className="block text-xs text-gray-400 truncate max-w-[180px]">{item.description}</span>}
                  </td>
                  <td className="py-3">{formatPartCategory(item.partCategory)}</td>
                  <td className="py-3">{item.vehicleMake || '—'} {item.vehicleModel && `/ ${item.vehicleModel}`}</td>
                  <td className="py-3 text-xs">{formatCompany(item.company)}</td>
                  <td className="py-3">{formatCurrency(Number(item.costPrice))}</td>
                  <td className="py-3 font-semibold text-brand-700">{formatCurrency(Number(item.sellingPrice))}</td>
                  <td className="py-3">
                    <span className={`font-bold ${item.quantity <= 0 ? 'text-red-600' : item.quantity <= 3 ? 'text-orange-600' : 'text-green-700'}`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(item)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
