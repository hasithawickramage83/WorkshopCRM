import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Car, Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { publicRegistrationApi } from '../lib/api';
import {
  BUSINESS_COMPANIES, JOB_CATEGORIES, JOB_SOURCES, JOB_SUB_TASK_TYPES, formatCurrency, jobPriceSummary,
} from '../lib/types';
import {
  MAKE_OPTIONS, OTHER_MAKE, OTHER_MODEL, getModelsForMake,
} from '../lib/vehicleMakes';

interface JobEntry {
  taskType: string;
  description: string;
  price: string;
}

interface PublicDealer {
  id: string;
  customerCode: string;
  name: string;
  companyName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  displayName: string;
}

const emptyJob = (): JobEntry => ({
  taskType: 'OTHER',
  description: '',
  price: '',
});

function applyDealerToForm(
  dealer: PublicDealer,
  setters: {
    setName: (v: string) => void;
    setPhone: (v: string) => void;
    setEmail: (v: string) => void;
    setAddress: (v: string) => void;
    setJobCategory: (v: string) => void;
    setJobSource: (v: string) => void;
    setAddGst: (v: boolean) => void;
    setSelectedDealerCode: (v: string) => void;
  },
) {
  setters.setName(dealer.displayName || dealer.name);
  setters.setPhone(dealer.phone || '');
  setters.setEmail(dealer.email || '');
  setters.setAddress(dealer.address || '');
  setters.setJobCategory('DEALER');
  setters.setJobSource('DEALER');
  setters.setAddGst(true);
  setters.setSelectedDealerCode(dealer.customerCode);
}

export default function JobRegistrationPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams] = useSearchParams();
  const dealerParam = (searchParams.get('dealer') || searchParams.get('dealerCode') || '').trim();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [make, setMake] = useState('');
  const [customMake, setCustomMake] = useState('');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [year, setYear] = useState('');
  const [colour, setColour] = useState('');
  const [jobCategory, setJobCategory] = useState('NON_DEALER');
  const [company, setCompany] = useState('CEYLON_AUTOMOBILE');
  const [jobSource, setJobSource] = useState('WALK_IN');
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [addGst, setAddGst] = useState(false);
  const [jobs, setJobs] = useState<JobEntry[]>([emptyJob()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ customerCode: string; jobNumbers: string[] } | null>(null);

  const [dealers, setDealers] = useState<PublicDealer[]>([]);
  const [dealersLoading, setDealersLoading] = useState(true);
  const [selectedDealerCode, setSelectedDealerCode] = useState('');
  const [dealerLinkLocked, setDealerLinkLocked] = useState(false);
  const [dealerLoadError, setDealerLoadError] = useState('');

  const modelOptions = make ? getModelsForMake(make) : [];
  const resolvedMake = make === OTHER_MAKE ? customMake.trim() : make;
  const resolvedModel = model === OTHER_MODEL ? customModel.trim() : model;
  const isDealerJob = jobCategory === 'DEALER';
  const dealerFieldsLocked = dealerLinkLocked && Boolean(selectedDealerCode);
  const phoneLocked = dealerFieldsLocked && Boolean(phone.trim());
  const emailLocked = dealerFieldsLocked && Boolean(email.trim());
  const addressLocked = dealerFieldsLocked && Boolean(address.trim());

  useEffect(() => {
    let cancelled = false;
    setDealersLoading(true);
    publicRegistrationApi.listDealers()
      .then((res) => {
        if (cancelled) return;
        setDealers(res.data.data.dealers || []);
      })
      .catch(() => {
        if (!cancelled) setDealerLoadError('Could not load dealer list.');
      })
      .finally(() => {
        if (!cancelled) setDealersLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!dealerParam) return;
    let cancelled = false;

    const fromList = dealers.find(
      (d) => d.customerCode.toUpperCase() === dealerParam.toUpperCase(),
    );
    if (fromList) {
      applyDealerToForm(fromList, {
        setName, setPhone, setEmail, setAddress, setJobCategory, setJobSource, setAddGst, setSelectedDealerCode,
      });
      setDealerLinkLocked(true);
      setDealerLoadError('');
      return;
    }

    if (dealersLoading) return;

    publicRegistrationApi.getDealer(dealerParam)
      .then((res) => {
        if (cancelled) return;
        const dealer = res.data.data.dealer as PublicDealer;
        applyDealerToForm(dealer, {
          setName, setPhone, setEmail, setAddress, setJobCategory, setJobSource, setAddGst, setSelectedDealerCode,
        });
        setDealerLinkLocked(true);
        setDealerLoadError('');
        setDealers((prev) => (
          prev.some((d) => d.id === dealer.id) ? prev : [...prev, dealer]
        ));
      })
      .catch(() => {
        if (!cancelled) {
          setDealerLoadError(`Dealer link "${dealerParam}" was not found. Please select a dealer or contact the workshop.`);
          setDealerLinkLocked(false);
        }
      });

    return () => { cancelled = true; };
  }, [dealerParam, dealers, dealersLoading]);

  const updateJob = (index: number, field: keyof JobEntry, value: string) => {
    setJobs((prev) => prev.map((job, i) => (i === index ? { ...job, [field]: value } : job)));
  };

  const addJob = () => setJobs((prev) => [...prev, emptyJob()]);

  const removeJob = (index: number) => {
    if (jobs.length === 1) return;
    setJobs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMakeChange = (value: string) => {
    setMake(value);
    setModel('');
    setCustomModel('');
    if (value !== OTHER_MAKE) setCustomMake('');
  };

  const handleDealerSelect = (code: string) => {
    if (dealerLinkLocked) return;
    setSelectedDealerCode(code);
    if (!code) return;
    const dealer = dealers.find((d) => d.customerCode === code);
    if (!dealer) return;
    applyDealerToForm(dealer, {
      setName, setPhone, setEmail, setAddress, setJobCategory, setJobSource, setAddGst, setSelectedDealerCode,
    });
  };

  const handleCategoryChange = (next: string) => {
    if (dealerFieldsLocked) return;
    setJobCategory(next);
    if (next === 'DEALER') {
      setAddGst(true);
      setJobSource('DEALER');
    } else {
      setSelectedDealerCode('');
      if (jobSource === 'DEALER') setJobSource('WALK_IN');
    }
  };

  const formAddGst = addGst;
  const jobsTotal = jobs.reduce((sum, job) => sum + (job.price ? parseFloat(job.price) : 0), 0);
  const priceSummary = jobPriceSummary(
    jobs.map((j) => ({ price: j.price ? parseFloat(j.price) : 0 })),
    null,
    formAddGst,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedMake || !resolvedModel) {
      setError('Please select or enter vehicle make and model');
      return;
    }
    if (isDealerJob && !selectedDealerCode && !name.trim()) {
      setError('Please select a dealer or enter dealer details');
      return;
    }
    setError('');
    setSubmitting(true);

    const payload = {
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim(),
      address: address.trim() || undefined,
      registrationNo: registrationNo.trim(),
      make: resolvedMake,
      model: resolvedModel,
      year: year ? parseInt(year, 10) : undefined,
      colour: colour.trim() || undefined,
      jobCategory,
      company,
      jobSource,
      receivedDate: receivedDate || undefined,
      dueDate: dueDate || undefined,
      addGst,
      ...(selectedDealerCode ? { dealerCode: selectedDealerCode } : {}),
      jobs: jobs.map((job) => ({
        description: job.description.trim(),
        taskType: job.taskType,
        price: job.price ? parseFloat(job.price) : null,
      })),
    };

    try {
      const res = await publicRegistrationApi.submitJobRegistration(payload);
      const data = res.data.data;
      setSuccess({
        customerCode: data.customer.customerCode,
        jobNumbers: data.jobs.map((j: { jobNumber: string }) => j.jobNumber),
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg || 'Failed to submit registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    const successContent = (
      <div className={`w-full ${embedded ? 'max-w-3xl' : 'max-w-lg'} card text-center space-y-4`}>
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
        <h1 className="text-2xl font-bold text-gray-900">Registration Submitted</h1>
        <p className="text-gray-600">
          Thank you! Your details have been received. Our team will contact you shortly.
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-left space-y-2">
          <p><span className="font-medium">Customer reference:</span> {success.customerCode}</p>
          <p><span className="font-medium">Job reference(s):</span> {success.jobNumbers.join(', ')}</p>
        </div>
        {!embedded && (
          <p className="text-sm text-gray-500">
            Track your job progress using your vehicle registration at the{' '}
            <Link to="/customer/login" className="text-brand-600 underline">customer portal</Link>.
          </p>
        )}
      </div>
    );

    if (embedded) return successContent;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-4">
        {successContent}
      </div>
    );
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {dealerLoadError && (
        <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-lg text-sm">{dealerLoadError}</div>
      )}
      {dealerLinkLocked && selectedDealerCode && (
        <div className="bg-brand-50 text-brand-800 px-4 py-3 rounded-lg text-sm">
          Dealer details for <strong>{name || selectedDealerCode}</strong> are pre-filled from your registration link.
          Please complete the vehicle and job details below.
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Your Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Select Dealer</label>
            <select
              className="input"
              value={selectedDealerCode}
              disabled={dealerFieldsLocked || dealersLoading}
              onChange={(e) => handleDealerSelect(e.target.value)}
            >
              <option value="">
                {dealersLoading ? 'Loading dealers…' : '— Select dealer to auto-fill details —'}
              </option>
              {dealers.map((d) => (
                <option key={d.id} value={d.customerCode}>
                  {d.displayName}{d.phone ? ` · ${d.phone}` : ''} ({d.customerCode})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Selecting a dealer fills name, phone, and job category. Vehicle details are filled below.
            </p>
          </div>
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              required
              value={name}
              readOnly={dealerFieldsLocked}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              readOnly={emailLocked}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Phone *</label>
            <input
              type="tel"
              className="input"
              required
              value={phone}
              readOnly={phoneLocked}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Job Category *</label>
            <select
              className="input"
              required
              value={jobCategory}
              disabled={dealerFieldsLocked}
              onChange={(e) => handleCategoryChange(e.target.value)}
            >
              {JOB_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Address</label>
            <textarea
              className="input"
              rows={2}
              value={address}
              readOnly={addressLocked}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">Vehicle Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Registration (Rego) *</label>
            <input
              className="input uppercase"
              required
              placeholder="e.g. ABC123"
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="label">Make *</label>
            <select className="input" required value={make} onChange={(e) => handleMakeChange(e.target.value)}>
              <option value="">Select make</option>
              {MAKE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {make === OTHER_MAKE && (
              <input
                className="input mt-2"
                required
                placeholder="Enter make"
                value={customMake}
                onChange={(e) => setCustomMake(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="label">Model *</label>
            <select
              className="input"
              required
              value={model}
              disabled={!make}
              onChange={(e) => {
                setModel(e.target.value);
                if (e.target.value !== OTHER_MODEL) setCustomModel('');
              }}
            >
              <option value="">{make ? 'Select model' : 'Select make first'}</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {model === OTHER_MODEL && (
              <input
                className="input mt-2"
                required
                placeholder="Enter model"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="label">Year</label>
            <input
              type="number"
              min="1900"
              max="2100"
              className="input"
              placeholder="e.g. 2018"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Colour</label>
            <input
              className="input"
              placeholder="e.g. Silver"
              value={colour}
              onChange={(e) => setColour(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Workshop</label>
            <select className="input" value={company} onChange={(e) => setCompany(e.target.value)}>
              {BUSINESS_COMPANIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-semibold text-gray-900">Job Details</h2>
          <button type="button" onClick={addJob} className="btn-secondary text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add Job
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-brand-50 border border-brand-100 rounded-lg p-4">
          <div>
            <label className="label">Job Source</label>
            <select
              className="input"
              value={jobSource}
              disabled={dealerFieldsLocked}
              onChange={(e) => setJobSource(e.target.value)}
            >
              {JOB_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Job Received Date *</label>
            <input
              type="date"
              className="input"
              required
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Expected Delivery Date</label>
            <input
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {jobsTotal > 0 && (
          <div className="text-sm text-brand-800 bg-brand-50 border border-brand-100 rounded-lg px-4 py-3 space-y-1">
            <label className="flex items-center gap-2 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={formAddGst}
                onChange={(e) => setAddGst(e.target.checked)}
                className="rounded"
              />
              Add GST (15%) to total
            </label>
            <p>
              Subtotal: <strong>{formatCurrency(priceSummary.subtotal)}</strong>
              {formAddGst && (
                <> · GST: <strong>{formatCurrency(priceSummary.gst)}</strong></>
              )}
              {' · '}Total: <strong>{formatCurrency(priceSummary.total)}</strong>
            </p>
          </div>
        )}

        {jobs.map((job, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-800">Job {index + 1}</h3>
              {jobs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeJob(index)}
                  className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Task Type *</label>
                <select
                  className="input"
                  required
                  value={job.taskType}
                  onChange={(e) => updateJob(index, 'taskType', e.target.value)}
                >
                  {JOB_SUB_TASK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Price (NZD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  value={job.price}
                  onChange={(e) => updateJob(index, 'price', e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Job Description *</label>
                <textarea
                  className="input"
                  rows={3}
                  required
                  placeholder="Describe the work required..."
                  value={job.description}
                  onChange={(e) => updateJob(index, 'description', e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit Registration
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Already have a job in progress?{' '}
        <Link to="/customer/login" className="text-brand-600 underline">View customer portal</Link>
        {!embedded && (
          <>
            {' · '}
            <Link to="/login" className="text-brand-600 underline">Staff login</Link>
          </>
        )}
      </p>
    </form>
  );

  if (embedded) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Job Registration</h1>
          <p className="text-gray-500 mt-1">Submit customer details and job requirements — shareable at /register</p>
        </div>
        <div className="card">{formContent}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <Car className="w-12 h-12 text-accent-500 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-white">Job Registration</h1>
          <p className="text-brand-300 mt-2">Submit your details and job requirements to Ceylon Automobile</p>
        </div>
        <div className="card">
          {formContent}
        </div>
      </div>
    </div>
  );
}
