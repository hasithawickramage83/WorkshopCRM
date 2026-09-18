import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          original.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  profile: () => api.get('/auth/profile'),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
  listUsers: () => api.get('/auth/users'),
  listRoles: () => api.get('/auth/roles'),
  listPages: () => api.get('/auth/pages'),
  createUser: (data: unknown) => api.post('/auth/users', data),
  updateUser: (id: string, data: unknown) => api.put(`/auth/users/${id}`, data),
  createRole: (data: unknown) => api.post('/auth/roles', data),
  updateRole: (id: string, data: unknown) => api.put(`/auth/roles/${id}`, data),
  deleteRole: (id: string) => api.delete(`/auth/roles/${id}`),
};

export const dashboardApi = {
  stats: (params?: { from?: string; to?: string }) => api.get('/dashboard/stats', { params }),
  recentJobs: () => api.get('/dashboard/recent-jobs'),
  jobsByStatus: () => api.get('/dashboard/jobs-by-status'),
};

export const customersApi = {
  list: (params?: Record<string, string>) => api.get('/customers', { params }),
  get: (id: string) => api.get(`/customers/${id}`),
  create: (data: unknown) => api.post('/customers', data),
  update: (id: string, data: unknown) => api.put(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
};

export const suppliersApi = {
  list: (params?: Record<string, string>) => api.get('/suppliers', { params }),
  get: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: unknown) => api.post('/suppliers', data),
  update: (id: string, data: unknown) => api.put(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
};

export const employeesApi = {
  list: (params?: Record<string, string>) => api.get('/employees', { params }),
  get: (id: string) => api.get(`/employees/${id}`),
  create: (data: unknown) => api.post('/employees', data),
  update: (id: string, data: unknown) => api.put(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
};

export const labourHoursApi = {
  getWeek: (weekStart?: string) => api.get('/labour-hours', { params: { weekStart } }),
  saveWeek: (data: unknown) => api.post('/labour-hours/week', data),
  delete: (id: string) => api.delete(`/labour-hours/${id}`),
};

export const vehiclesApi = {
  list: (params?: Record<string, string>) => api.get('/vehicles', { params }),
  get: (id: string) => api.get(`/vehicles/${id}`),
  create: (data: unknown) => api.post('/vehicles', data),
  update: (id: string, data: unknown) => api.put(`/vehicles/${id}`, data),
  delete: (id: string) => api.delete(`/vehicles/${id}`),
};

export const leadsApi = {
  list: (params?: Record<string, string>) => api.get('/leads', { params }),
  get: (id: string) => api.get(`/leads/${id}`),
  create: (data: unknown) => api.post('/leads', data),
  update: (id: string, data: unknown) => api.put(`/leads/${id}`, data),
  addFollowUp: (id: string, data: {
    status: string;
    description: string;
    nextDate?: string | null;
  }) => api.post(`/leads/${id}/follow-ups`, data),
  delete: (id: string) => api.delete(`/leads/${id}`),
};

export const jobsApi = {
  list: (params?: Record<string, string>) => api.get('/jobs', { params }),
  get: (id: string) => api.get(`/jobs/${id}`),
  create: (data: unknown) => api.post('/jobs', data),
  update: (id: string, data: unknown) => api.put(`/jobs/${id}`, data),
  updateStatus: (id: string, status: string, notes?: string) =>
    api.patch(`/jobs/${id}/status`, { status, notes }),
  delete: (id: string, remarks: string) => api.delete(`/jobs/${id}`, { data: { remarks } }),
  permanentDelete: (id: string) => api.delete(`/jobs/${id}/permanent`),
};

export const inventoryApi = {
  list: (params?: Record<string, string>) => api.get('/inventory', { params }),
  get: (id: string) => api.get(`/inventory/${id}`),
  create: (data: unknown) => api.post('/inventory', data),
  update: (id: string, data: unknown) => api.put(`/inventory/${id}`, data),
  delete: (id: string) => api.delete(`/inventory/${id}`),
};

export const partSalesApi = {
  list: (params?: Record<string, string>) => api.get('/part-sales', { params }),
  get: (id: string) => api.get(`/part-sales/${id}`),
  create: (data: unknown) => api.post('/part-sales', data),
  update: (id: string, data: unknown) => api.put(`/part-sales/${id}`, data),
  delete: (id: string) => api.delete(`/part-sales/${id}`),
};

export const insuranceApi = {
  list: (params?: Record<string, string>) => api.get('/insurance-claims', { params }),
  create: (data: unknown) => api.post('/insurance-claims', data),
};

export const quotationsApi = {
  list: (params?: Record<string, string>) => api.get('/quotations', { params }),
  get: (id: string) => api.get(`/quotations/${id}`),
  create: (data: unknown) => api.post('/quotations', data),
  update: (id: string, data: unknown) => api.put(`/quotations/${id}`, data),
  sendEmail: (id: string) => api.post(`/quotations/${id}/send-email`),
  sendWhatsApp: (id: string) => api.post(`/quotations/${id}/send-whatsapp`),
};

export const invoicesApi = {
  list: (params?: Record<string, string>) => api.get('/invoices', { params }),
  get: (id: string) => api.get(`/invoices/${id}`),
  create: (data: unknown) => api.post('/invoices', data),
  createFromJob: (data: {
    jobId: string;
    invoiceNumber?: string;
    discount?: number;
    notes?: string;
    includeGst?: boolean;
  }) => api.post('/invoices/from-job', data),
  addPayment: (id: string, data: {
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
    collectionType?: string;
    paidAt?: string;
  }) => api.post(`/invoices/${id}/payments`, data),
  updateAmountPaid: (id: string, amountPaid: number) =>
    api.patch(`/invoices/${id}/amount-paid`, { amountPaid }),
};

export const financeApi = {
  weeklySummary: (params?: { from?: string; to?: string }) =>
    api.get('/finance/weekly-summary', { params }),
  weeklyDetails: (params: { metric: string; from?: string; to?: string; party?: string }) =>
    api.get('/finance/weekly-details', { params }),
  periodReport: (params?: { from?: string; to?: string }) =>
    api.get('/finance/period-report', { params }),
  listExpenses: (params?: Record<string, string>) =>
    api.get('/finance/expenses', { params }),
  createExpense: (data: unknown) => api.post('/finance/expenses', data),
  updateExpense: (id: string, data: unknown) => api.put(`/finance/expenses/${id}`, data),
  deleteExpense: (id: string) => api.delete(`/finance/expenses/${id}`),
  listCollections: (params?: Record<string, string>) =>
    api.get('/finance/collections', { params }),
  listCollectionJobs: (params?: { search?: string; limit?: string }) =>
    api.get('/finance/collection-jobs', { params }),
  createCollection: (data: unknown) => api.post('/finance/collections', data),
  createBulkCollection: (data: {
    invoiceIds: string[];
    amount: number;
    paymentMethod: string;
    collectionType?: string;
    paidAt?: string;
    reference?: string;
    notes?: string;
  }) => api.post('/finance/collections/bulk', data),
  createBulkJobCollection: (data: {
    jobIds: string[];
    amount: number;
    paymentMethod: string;
    collectionType?: string;
    paidAt?: string;
    reference?: string;
    notes?: string;
  }) => api.post('/finance/collections/bulk-jobs', data),
  listCollectionInvoices: (params?: { search?: string; limit?: string }) =>
    api.get('/finance/collection-invoices', { params }),
  createAdditionalCollection: (data: {
    customerId: string;
    description: string;
    amount: number;
    addGst?: boolean;
    paymentMethod: string;
    collectionType?: string;
    paidAt?: string;
    reference?: string | null;
    notes?: string | null;
  }) => api.post('/finance/collections/additional', data),
  backfillCollectionsFromInvoices: () =>
    api.post('/finance/collections/backfill-from-invoices'),
  updateCollection: (id: string, data: unknown) => api.put(`/finance/collections/${id}`, data),
  deleteCollection: (id: string) => api.delete(`/finance/collections/${id}`),
};

export const outVehiclesApi = {
  list: (params?: Record<string, string>) => api.get('/out-vehicles', { params }),
  markOut: (id: string, data: unknown) => api.post(`/out-vehicles/${id}/mark-out`, data),
  updateOut: (id: string, data: unknown) => api.put(`/out-vehicles/${id}`, data),
};

export const aiApi = {
  generate: (data: unknown) => api.post('/ai/generate', data),
  workshopAnalysis: (context: string) => api.post('/ai/workshop-analysis', { context }),
  customerMessage: (context: string, channel?: string) =>
    api.post('/ai/customer-message', { context, channel }),
};

export const reportsApi = {
  workshopSales: (params?: { from?: string; to?: string; jobCategory?: string }) =>
    api.get('/reports/workshop-sales', { params }),
  jobsReport: (params?: { from?: string; to?: string; jobCategory?: string }) =>
    api.get('/reports/jobs', { params }),
  monthlyRevenue: (year?: number, jobCategory?: string) =>
    api.get('/reports/monthly-revenue', { params: { year, jobCategory: jobCategory || undefined } }),
  jobsBySource: (jobCategory?: string) =>
    api.get('/reports/jobs-by-source', { params: { jobCategory: jobCategory || undefined } }),
  technicianProductivity: (jobCategory?: string) =>
    api.get('/reports/technician-productivity', { params: { jobCategory: jobCategory || undefined } }),
  outstandingInvoices: (jobCategory?: string) =>
    api.get('/reports/outstanding-invoices', { params: { jobCategory: jobCategory || undefined } }),
  export: (type: string, format = 'csv') =>
    api.get(`/reports/export/${type}`, { params: { format }, responseType: format === 'csv' ? 'blob' : 'json' }),
};

export const attendanceApi = {
  status: () => api.get('/attendance/status'),
  clockIn: (latitude: number, longitude: number) =>
    api.post('/attendance/clock-in', { latitude, longitude }),
  clockOut: (latitude: number, longitude: number, reason: 'BREAK' | 'END_OF_DAY') =>
    api.post('/attendance/clock-out', { latitude, longitude, reason }),
  myHistory: (params?: { from?: string; to?: string }) =>
    api.get('/attendance/my-history', { params }),
  report: (params?: { from?: string; to?: string; userId?: string }) =>
    api.get('/attendance/report', { params }),
};

const customerApi = axios.create({ baseURL: API_BASE });

customerApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('customerToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

customerApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('customerToken');
      localStorage.removeItem('customerSession');
      if (!window.location.pathname.startsWith('/customer/login')) {
        window.location.href = '/customer/login';
      }
    }
    return Promise.reject(error);
  }
);

export const customerPortalApi = {
  login: (registrationNo: string) => customerApi.post('/customer-auth/login', { registrationNo }),
  profile: () => customerApi.get('/customer-portal/profile'),
  vehicle: () => customerApi.get('/customer-portal/vehicle'),
  jobs: () => customerApi.get('/customer-portal/jobs'),
  jobDetail: (id: string) => customerApi.get(`/customer-portal/jobs/${id}`),
  invoices: () => customerApi.get('/customer-portal/invoices'),
};

const publicApi = axios.create({ baseURL: API_BASE });

export const publicRegistrationApi = {
  submitJobRegistration: (data: unknown) => publicApi.post('/public/job-registration', data),
  listDealers: () => publicApi.get('/public/dealers'),
  getDealer: (code: string) => publicApi.get(`/public/dealers/${encodeURIComponent(code)}`),
};

export const whatsappApi = {
  status: () => api.get('/whatsapp/status'),
  start: () => api.post('/whatsapp/start'),
  stop: () => api.post('/whatsapp/stop'),
  qr: () => api.get('/whatsapp/qr'),
  groups: () => api.get('/whatsapp/groups'),
  selectGroup: (groupId: string) => api.post('/whatsapp/group', { groupId }),
  test: () => api.post('/whatsapp/test'),
};

export const adminBackupApi = {
  list: () => api.get('/admin/backups'),
  create: () => api.post('/admin/backups', {}, { timeout: 10 * 60 * 1000 }),
};
