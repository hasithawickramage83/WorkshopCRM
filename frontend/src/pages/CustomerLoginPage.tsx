import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Car, Loader2, ClipboardList } from 'lucide-react';
import { useCustomerAuth } from '../context/CustomerAuthContext';

export default function CustomerLoginPage() {
  const { login, session, loading } = useCustomerAuth();
  const [registrationNo, setRegistrationNo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (session) return <Navigate to="/customer" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(registrationNo.trim());
    } catch {
      setError('Vehicle not found. Please check your registration number.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Car className="w-12 h-12 text-accent-500 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-white">Customer Portal</h1>
          <p className="text-brand-300 mt-2">Track your vehicle repair status</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-xl font-semibold text-gray-900">Vehicle Login</h2>
          <p className="text-sm text-gray-500">Enter your vehicle registration number to view job progress, invoices, and account details.</p>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="label">Registration Number</label>
            <input
              className="input uppercase"
              placeholder="e.g. ABC123"
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value.toUpperCase())}
              required
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            View My Jobs
          </button>

          <p className="text-xs text-gray-500 text-center">
            Demo vehicle: <strong>ABC123</strong>
          </p>
        </form>

        <Link
          to="/register"
          className="mt-4 card flex items-center gap-3 hover:shadow-md transition-shadow border-brand-100 bg-brand-50/50"
        >
          <ClipboardList className="w-8 h-8 text-brand-600 shrink-0" />
          <div>
            <p className="font-semibold text-gray-900">Register a New Job</p>
            <p className="text-sm text-gray-500">Submit your details and vehicle for a new repair request</p>
          </div>
        </Link>

        <p className="text-center mt-6 text-brand-300 text-sm">
          Staff login? <Link to="/login" className="text-white underline hover:text-accent-500">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}
