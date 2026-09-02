import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { vehiclesApi, customersApi } from '../lib/api';
import { Customer } from '../lib/types';

interface Vehicle {
  id: string;
  vehicleCode: string;
  registrationNo: string;
  make: string;
  model: string;
  year?: number;
  colour?: string;
  vin?: string;
  engineNumber?: string;
  notes?: string;
  ownerId?: string;
  owner?: { id?: string; name: string };
}

const emptyForm = {
  registrationNo: '', make: '', model: '', year: '', colour: '', vin: '', engineNumber: '', notes: '', ownerId: '',
};

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);

  const load = (q = search) => {
    const params: Record<string, string> = { limit: '500' };
    if (q.trim()) params.search = q.trim();
    return vehiclesApi.list(params).then((res) => {
      setVehicles(res.data.data.vehicles);
      setTotal(res.data.data.total ?? res.data.data.vehicles.length);
    });
  };

  useEffect(() => {
    load();
    customersApi.list({ limit: '500' }).then((res) => setCustomers(res.data.data.customers));
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEdit = async (vehicle: Vehicle) => {
    setError('');
    setEditingId(vehicle.id);
    setShowForm(true);
    try {
      const res = await vehiclesApi.get(vehicle.id);
      const detail = res.data.data as Vehicle;
      setForm({
        registrationNo: detail.registrationNo,
        make: detail.make,
        model: detail.model,
        year: detail.year ? String(detail.year) : '',
        colour: detail.colour || '',
        vin: detail.vin || '',
        engineNumber: detail.engineNumber || '',
        notes: detail.notes || '',
        ownerId: detail.ownerId || detail.owner?.id || '',
      });
      // Ensure current owner appears in the dropdown even if not in the loaded page
      if (detail.owner?.id && !customers.some((c) => c.id === detail.owner!.id)) {
        setCustomers((prev) => [
          { id: detail.owner!.id!, name: detail.owner!.name, customerCode: '', customerType: '', createdAt: '' },
          ...prev,
        ]);
      }
    } catch {
      setForm({
        registrationNo: vehicle.registrationNo,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year ? String(vehicle.year) : '',
        colour: vehicle.colour || '',
        vin: vehicle.vin || '',
        engineNumber: vehicle.engineNumber || '',
        notes: vehicle.notes || '',
        ownerId: vehicle.ownerId || vehicle.owner?.id || '',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.make.trim() || !form.model.trim()) {
      setError('Make and model are required');
      return;
    }
    if (!form.ownerId) {
      setError('Owner is required');
      return;
    }
    const payload = {
      registrationNo: form.registrationNo.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year ? parseInt(form.year, 10) : null,
      colour: form.colour.trim() || null,
      vin: form.vin.trim() || null,
      engineNumber: form.engineNumber.trim() || null,
      notes: form.notes.trim() || null,
      ownerId: form.ownerId,
    };
    setSaving(true);
    try {
      if (editingId) {
        await vehiclesApi.update(editingId, payload);
        setToast('Vehicle updated');
      } else {
        await vehiclesApi.create(payload);
        setToast('Vehicle created');
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg || 'Failed to save vehicle');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicle: Vehicle) => {
    if (!confirm(`Delete vehicle ${vehicle.registrationNo} — ${vehicle.make} ${vehicle.model}?`)) return;
    try {
      await vehiclesApi.delete(vehicle.id);
      setToast('Vehicle deleted');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setToast(msg || 'Failed to delete vehicle');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(search);
  };

  const ownerOptions = (() => {
    const list = [...customers];
    if (form.ownerId && !list.some((c) => c.id === form.ownerId)) {
      const fromVehicle = vehicles.find((v) => (v.ownerId || v.owner?.id) === form.ownerId);
      list.unshift({
        id: form.ownerId,
        name: fromVehicle?.owner?.name || 'Current owner',
        customerCode: '',
        customerType: '',
        createdAt: '',
      });
    }
    return list;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vehicles</h1>
          <p className="text-gray-500">Vehicle registry and history</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Vehicle
        </button>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search rego, make, model, VIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-secondary">Search</button>
        {search && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setSearch(''); load(''); }}
          >
            Clear
          </button>
        )}
      </form>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h3 className="font-semibold">{editingId ? 'Edit Vehicle' : 'New Vehicle'}</h3>
          {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Registration *</label>
              <input
                className="input font-mono"
                required
                value={form.registrationNo}
                onChange={(e) => setForm({ ...form, registrationNo: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Make *</label>
              <input
                className="input"
                required
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                placeholder="e.g. Volvo"
              />
            </div>
            <div>
              <label className="label">Model *</label>
              <input
                className="input"
                required
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. V80"
              />
            </div>
            <div>
              <label className="label">Year</label>
              <input type="number" className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </div>
            <div>
              <label className="label">Colour</label>
              <input className="input" value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value })} />
            </div>
            <div>
              <label className="label">VIN</label>
              <input className="input" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
            </div>
            <div>
              <label className="label">Engine No.</label>
              <input className="input" value={form.engineNumber} onChange={(e) => setForm({ ...form, engineNumber: e.target.value })} />
            </div>
            <div>
              <label className="label">Owner *</label>
              <select className="input" required value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                <option value="">Select customer</option>
                {ownerOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm text-gray-500">
            Showing {vehicles.length} of {total} vehicle{total === 1 ? '' : 's'}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3">Reg No</th>
              <th className="pb-3">Make / Model</th>
              <th className="pb-3">Year</th>
              <th className="pb-3">Colour</th>
              <th className="pb-3">Owner</th>
              <th className="pb-3 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No vehicles found{search ? ` for “${search}”` : ''}
                </td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium font-mono">{v.registrationNo}</td>
                  <td className="py-3">{v.make} {v.model}</td>
                  <td className="py-3">{v.year || '—'}</td>
                  <td className="py-3">{v.colour || '—'}</td>
                  <td className="py-3">{v.owner?.name || '—'}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => openEdit(v)} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(v)} className="p-1.5 hover:bg-red-50 rounded text-red-600" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
