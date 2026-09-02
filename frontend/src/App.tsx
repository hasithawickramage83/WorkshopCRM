import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CustomerAuthProvider, useCustomerAuth } from './context/CustomerAuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import EmployeesPage from './pages/EmployeesPage';
import VehiclesPage from './pages/VehiclesPage';
import LeadsPage from './pages/LeadsPage';
import JobsPage from './pages/JobsPage';
import InsurancePage from './pages/InsurancePage';
import QuotationsPage from './pages/QuotationsPage';
import InvoicesPage from './pages/InvoicesPage';
import FinancePage from './pages/FinancePage';
import AIPage from './pages/AIPage';
import ReportsPage from './pages/ReportsPage';
import AttendancePage from './pages/AttendancePage';
import InventoryPage from './pages/InventoryPage';
import PartsSalesPage from './pages/PartsSalesPage';
import UsersPage from './pages/UsersPage';
import CustomerLoginPage from './pages/CustomerLoginPage';
import CustomerPortalPage from './pages/CustomerPortalPage';
import JobRegistrationPage from './pages/JobRegistrationPage';
import OutVehiclesPage from './pages/OutVehiclesPage';
import WhatsAppPage from './pages/WhatsAppPage';
import { Loader2 } from 'lucide-react';
import type { PageKey } from './lib/pages';

function RegisterRoute() {
  const { user, loading, canAccess, firstAccessiblePath } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (user) {
    if (!canAccess('register')) {
      return <Navigate to={firstAccessiblePath()} replace />;
    }
    return (
      <Layout>
        <JobRegistrationPage embedded />
      </Layout>
    );
  }
  return <JobRegistrationPage />;
}

function ProtectedRoute({
  children,
  page,
}: {
  children: React.ReactNode;
  page: PageKey;
}) {
  const { user, loading, canAccess, firstAccessiblePath } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(page)) {
    return <Navigate to={firstAccessiblePath()} replace />;
  }
  return <Layout>{children}</Layout>;
}

function CustomerProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useCustomerAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!session) return <Navigate to="/customer/login" replace />;
  return <>{children}</>;
}

function StaffRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute page="dashboard"><DashboardPage /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute page="customers"><CustomersPage /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute page="suppliers"><SuppliersPage /></ProtectedRoute>} />
      <Route path="/employees" element={<ProtectedRoute page="employees"><EmployeesPage /></ProtectedRoute>} />
      <Route path="/vehicles" element={<ProtectedRoute page="vehicles"><VehiclesPage /></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute page="leads"><LeadsPage /></ProtectedRoute>} />
      <Route path="/jobs" element={<ProtectedRoute page="jobs"><JobsPage /></ProtectedRoute>} />
      <Route path="/out-vehicles" element={<ProtectedRoute page="out-vehicles"><OutVehiclesPage /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute page="inventory"><InventoryPage /></ProtectedRoute>} />
      <Route path="/parts-sales" element={<ProtectedRoute page="parts-sales"><PartsSalesPage /></ProtectedRoute>} />
      <Route path="/insurance" element={<ProtectedRoute page="insurance"><InsurancePage /></ProtectedRoute>} />
      <Route path="/quotations" element={<ProtectedRoute page="quotations"><QuotationsPage /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute page="invoices"><InvoicesPage /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute page="finance"><FinancePage /></ProtectedRoute>} />
      <Route path="/ai" element={<ProtectedRoute page="ai"><AIPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute page="reports"><ReportsPage /></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute page="attendance"><AttendancePage /></ProtectedRoute>} />
      <Route path="/whatsapp" element={<ProtectedRoute page="whatsapp"><WhatsAppPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute page="users"><UsersPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function CustomerRoutes() {
  return (
    <CustomerAuthProvider>
      <Routes>
        <Route path="login" element={<CustomerLoginPage />} />
        <Route index element={<CustomerProtectedRoute><CustomerPortalPage /></CustomerProtectedRoute>} />
        <Route path="*" element={<Navigate to="/customer" replace />} />
      </Routes>
    </CustomerAuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/customer/*" element={<CustomerRoutes />} />
          <Route path="/*" element={<StaffRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
