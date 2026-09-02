import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login, user, loading, firstAccessiblePath } = useAuth();
  const [email, setEmail] = useState('admin@ceylonautomobile.co.nz');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (user) return <Navigate to={firstAccessiblePath()} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      setError('Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Ceylon Automobile</h1>
          <p className="text-brand-300 mt-2">Workshop Management & CRM System</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-xl font-semibold text-gray-900">Sign In</h2>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign In
          </button>

          <p className="text-xs text-gray-500 text-center">
            Demo: admin@ceylonautomobile.co.nz / Admin@123
          </p>
        </form>

        <p className="text-center mt-6 text-brand-300 text-sm">
          Customer? <Link to="/customer/login" className="text-white underline hover:text-accent-500">Track your vehicle repair</Link>
          {' · '}
          <Link to="/register" className="text-white underline hover:text-accent-500">Register a job</Link>
        </p>
      </div>
    </div>
  );
}
