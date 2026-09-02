import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { partSalesApi, customersApi, inventoryApi } from '../lib/api';
import {
  Customer, formatDate, formatStatus, formatCurrency, formatCompany, formatPartCategory,
  BUSINESS_COMPANIES,
} from '../lib/types';

interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  company: string;
  partCategory: string;
  vehicleMake?: string;
  vehicleModel?: string;
  sellingPrice: number | string;
  quantity: number;
}

interface PartSale {
  id: string;
  saleCode: string;
  company: string;
  partCategory: string;
  partName: string;
  customerName: string;
  customerId?: string | null;
  phone?: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  status: string;
  notes?: string;
  createdAt: string;
  inventoryItemId?: string;
  inventoryItem?: InventoryItem;
}

const STATUSES = ['PENDING', 'SOLD', 'CANCELLED'];

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  SOLD: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const emptyForm = {
  inventoryItemId: '',
  company: 'CEYLON_AUTOMOBILE',
  customerId: '',
  customerName: '',
  phone: '',
  quantity: '1',
  status: 'SOLD',
  notes: '',
};

export default function PartsSalesPage() {
  const [sales, setSales] = useState<PartSale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState('');

  const load = () => partSalesApi.list().then((res) => setSales(res.data.data.partSales));

  const loadInventory = () =>
    inventoryApi.list({ limit: '500', inStock: 'true' }).then((res) => setInventory(res.data.data.items));

  useEffect(() => {
    load();
    loadInventory();
    customersApi.list({ limit: '200' }).then((res) => setCustomers(res.data.data.customers));
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const selectedItem = inventory.find((i) => i.id === form.inventoryItemId);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    loadInventory();
    setShowForm(true);
  };

  const openEdit = (sale: PartSale) => {
    setEditingId(sale.id);
    setForm({
      inventoryItemId: sale.inventoryItemId || sale.inventoryItem?.id || '',
      company: sale.company || 'CEYLON_AUTOMOBILE',
      customerId: sale.customerId || '',
      customerName: sale.customerName,
      phone: sale.phone || '',
      quantity: String(sale.quantity),
      status: sale.status,
      notes: sale.notes || '',
    });
    inventoryApi.list({ limit: '500' }).then((res) => setInventory(res.data.data.items));
    setShowForm(true);
  };

  const onInventorySelect = (inventoryItemId: string) => {
    const item = inventory.find((i) => i.id === inventoryItemId);
    setForm({
      ...form,
      inventoryItemId,
      company: item?.company || form.company,
    });
  };

  const onCustomerSelect = (customerId: string) => {
    const c = customers.find((x) => x.id === customerId);
    setForm({
      ...form,
      customerId,
      customerName: c?.name || form.customerName,
      phone: c?.phone || form.phone,
    });
  };

  const qty = parseInt(form.quantity) || 1;
  const unitPrice = selectedItem ? Number(selectedItem.sellingPrice) : 0;
  const stockOk = selectedItem ? selectedItem.quantity >= qty : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.inventoryItemId) {
      setToast('Please select an inventory item');
      return;
    }
    if (form.status === 'SOLD' && !stockOk) {
      setToast(`Insufficient stock — only ${selectedItem?.quantity ?? 0} available`);
      return;
    }
    const payload = {
      inventoryItemId: form.inventoryItemId,
      company: form.company,
      customerId: form.customerId || null,
      customerName: form.customerName,
      phone: form.phone || undefined,
      quantity: qty,
      status: form.status,
      notes: form.notes || undefined,
    };
    try {
      if (editingId) {
        await partSalesApi.update(editingId, payload);
        setToast('Sale updated');
      } else {
        await partSalesApi.create(payload);
        setToast('Sale recorded');
      }
      setShowForm(false);
      load();
      loadInventory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setToast(msg || 'Failed to save');
    }
  };

  const handleDelete = async (sale: PartSale) => {
    if (!confirm(`Delete sale ${sale.saleCode} — ${sale.partName}?`)) return;
    try {
      await partSalesApi.delete(sale.id);
      setToast('Deleted — stock restored if sold');
      load();
      loadInventory();
    } catch {
      setToast('Failed to delete');
    }
  };

  const handleStatusChange = async (sale: PartSale, status: string) => {
    try {
      await partSalesApi.update(sale.id, { status });
      load();
      loadInventory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setToast(msg || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Parts Sales</h1>
          <p className="text-gray-500">Sell items from inventory — stock updates automatically when marked Sold</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Sale
        </button>
      </div>

      {toast && <div className="bg-brand-50 text-brand-800 px-4 py-3 rounded-lg text-sm">{toast}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">{editingId ? 'Edit Part Sale' : 'New Part Sale'}</h3>
            <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Inventory Item *</label>
              <select
                className="input"
                required
                value={form.inventoryItemId}
                onChange={(e) => onInventorySelect(e.target.value)}
                disabled={!!editingId && form.status === 'SOLD'}
              >
                <option value="">Select from inventory...</option>
                {inventory.map((item) => (
                  <option key={item.id} value={item.id} disabled={!editingId && item.quantity <= 0}>
                    {item.itemCode} — {item.itemName}
                    {item.vehicleMake && ` (${item.vehicleMake}${item.vehicleModel ? ` ${item.vehicleModel}` : ''})`}
                    {' · '}Stock: {item.quantity} · {formatCurrency(Number(item.sellingPrice))}
                  </option>
                ))}
              </select>
              {inventory.length === 0 && (
                <p className="text-sm text-orange-600 mt-1">No items in stock. Add items on the Inventory page first.</p>
              )}
            </div>

            {selectedItem && (
              <div className="md:col-span-2 bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-gray-500">Category</span><p className="font-medium">{formatPartCategory(selectedItem.partCategory)}</p></div>
                <div><span className="text-gray-500">Make / Model</span><p className="font-medium">{selectedItem.vehicleMake || '—'} {selectedItem.vehicleModel || ''}</p></div>
                <div><span className="text-gray-500">Selling Price</span><p className="font-bold text-brand-700">{formatCurrency(Number(selectedItem.sellingPrice))}</p></div>
                <div><span className="text-gray-500">In Stock</span><p className={`font-bold ${selectedItem.quantity <= 0 ? 'text-red-600' : 'text-green-700'}`}>{selectedItem.quantity}</p></div>
              </div>
            )}

            <div>
              <label className="label">Company</label>
              <select className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                {BUSINESS_COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Link Customer</label>
              <select className="input" value={form.customerId} onChange={(e) => onCustomerSelect(e.target.value)}>
                <option value="">— Walk-in —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customerCode})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Customer Name *</label>
              <input className="input" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Quantity</label>
              <input type="number" min="1" max={selectedItem?.quantity || undefined} className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              {selectedItem && qty > selectedItem.quantity && (
                <p className="text-xs text-red-600 mt-1">Exceeds stock ({selectedItem.quantity} available)</p>
              )}
            </div>
            <div>
              <label className="label">Total</label>
              <input className="input bg-gray-50 font-bold text-brand-700" readOnly value={formatCurrency(qty * unitPrice)} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Stock deducts when status is Sold</p>
            </div>
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={form.status === 'SOLD' && !stockOk}>
              {editingId ? 'Save Changes' : 'Create Sale'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sales.map((sale) => (
          <div key={sale.id} className="card">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-mono text-gray-400">{sale.saleCode}</span>
              <select
                className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer ${STATUS_COLORS[sale.status]}`}
                value={sale.status}
                onChange={(e) => handleStatusChange(sale, e.target.value)}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
              </select>
            </div>
            <h3 className="font-semibold">{sale.partName}</h3>
            <p className="text-xs text-brand-700 font-medium mt-0.5">
              {formatPartCategory(sale.partCategory)} · {formatCompany(sale.company)}
              {sale.inventoryItem?.vehicleMake && ` · ${sale.inventoryItem.vehicleMake} ${sale.inventoryItem.vehicleModel || ''}`}
            </p>
            <p className="text-sm text-gray-600 mt-1">{sale.customerName}</p>
            <p className="text-lg font-bold text-brand-700 mt-2">{formatCurrency(Number(sale.totalPrice))}</p>
            <p className="text-xs text-gray-400">Qty {sale.quantity} × {formatCurrency(Number(sale.unitPrice))}</p>
            {sale.notes && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{sale.notes}</p>}
            <div className="mt-3 flex justify-between items-center">
              <span className="text-xs text-gray-400">{formatDate(sale.createdAt)}</span>
              <div className="flex gap-1">
                <button onClick={() => openEdit(sale)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(sale)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
