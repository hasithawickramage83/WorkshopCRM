import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { insuranceApi, customersApi, vehiclesApi } from '../lib/api';
import { Customer, formatDate, formatStatus } from '../lib/types';

interface Claim {
  id: string;
  claimCode: string;
  insuranceCompany: string;
  claimNumber?: string;
  approvalStatus: string;
  approvedAmount?: number;
  customer?: { name: string };
  vehicle?: { registrationNo: string; make: string; model: string };
  createdAt: string;
}

export default function InsurancePage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; registrationNo: string; make: string; model: string; ownerId: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ insuranceCompany: '', claimNumber: '', customerId: '', vehicleId: '', notes: '' });

  const load = () => insuranceApi.list().then((res) => setClaims(res.data.data.claims));

  useEffect(() => {
    load();
    customersApi.list({ limit: '100' }).then((res) => setCustomers(res.data.data.customers));
    vehiclesApi.list({ limit: '100' }).then((res) => setVehicles(res.data.data.vehicles));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await insuranceApi.create(form);
    setShowForm(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Insurance Claims</h1>
          <p className="text-gray-500">Manage insurance claim assessments</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Claim
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Insurance Company *</label><input className="input" required value={form.insuranceCompany} onChange={(e) => setForm({ ...form, insuranceCompany: e.target.value })} /></div>
            <div><label className="label">Claim Number</label><input className="input" value={form.claimNumber} onChange={(e) => setForm({ ...form, claimNumber: e.target.value })} /></div>
            <div>
              <label className="label">Customer *</label>
              <select className="input" required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                <option value="">Select</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vehicle *</label>
              <select className="input" required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                <option value="">Select</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registrationNo}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Save</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3">Claim</th>
              <th className="pb-3">Insurer</th>
              <th className="pb-3">Customer</th>
              <th className="pb-3">Vehicle</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="py-3 font-mono text-xs">{c.claimCode}</td>
                <td className="py-3">{c.insuranceCompany}</td>
                <td className="py-3">{c.customer?.name}</td>
                <td className="py-3">{c.vehicle?.registrationNo}</td>
                <td className="py-3"><span className="badge bg-purple-100 text-purple-800">{formatStatus(c.approvalStatus)}</span></td>
                <td className="py-3 text-gray-500">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
