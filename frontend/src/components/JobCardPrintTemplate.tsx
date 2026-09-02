import {
  COMPANY_INVOICE,
  formatCurrency,
  formatDate,
  formatJobCategory,
  formatJobType,
  formatStatus,
  formatSubTaskType,
  jobPriceSummary,
  jobShouldAddGst,
} from '../lib/types';

const ASSETS = '/invoice-assets';
const ASSET_VERSION = '20260709';
const asset = (name: string) => `${ASSETS}/${name}?v=${ASSET_VERSION}`;

export interface JobCardSubTask {
  id?: string;
  taskType: string;
  description: string;
  price?: number | string | null;
}

export interface JobCardData {
  jobNumber: string;
  status: string;
  jobType?: string;
  jobCategory?: string | null;
  jobSource?: string;
  description?: string | null;
  receivedDate?: string;
  dueDate?: string | null;
  estimatedPrice?: number | string | null;
  addGst?: boolean;
  customer?: {
    name: string;
    phone?: string | null;
    email?: string | null;
  };
  vehicle?: {
    registrationNo: string;
    make: string;
    model: string;
    colour?: string | null;
  };
  subTasks?: JobCardSubTask[];
  assignedTechnician?: {
    firstName: string;
    lastName: string;
  } | null;
}

function dealerLabel(job: JobCardData) {
  const isDealer = job.jobCategory === 'DEALER'
    || (!job.jobCategory && job.jobSource === 'DEALER');
  return isDealer ? 'Dealer' : 'Non Dealer';
}

export default function JobCardPrintTemplate({ job }: { job: JobCardData }) {
  const addGst = jobShouldAddGst(job);
  const price = jobPriceSummary(job.subTasks, job.estimatedPrice, addGst);
  const lines = job.subTasks?.length
    ? job.subTasks
    : job.description
      ? [{ id: 'desc', taskType: 'OTHER', description: job.description, price: job.estimatedPrice }]
      : [];

  return (
    <div id="job-card-print" className="invoice-sheet">
      <img src={asset('top-banner.png')} alt="" className="invoice-top-banner" />

      <header className="invoice-header">
        <div className="invoice-header-left">
          <img src={asset('logo-block.png')} alt={COMPANY_INVOICE.name} className="invoice-logo-block" />
          <p className="invoice-trading-as">Trading as: {COMPANY_INVOICE.tradingAs}</p>
          <p className="invoice-services">{COMPANY_INVOICE.services}</p>
        </div>

        <div className="invoice-header-divider" />

        <div className="invoice-header-right">
          <div className="invoice-contact-row">
            <img src={asset('icon-0.png')} alt="" className="invoice-contact-icon" />
            <span>{COMPANY_INVOICE.phone}</span>
          </div>
          <div className="invoice-contact-row">
            <img src={asset('icon-1.png')} alt="" className="invoice-contact-icon" />
            <span>{COMPANY_INVOICE.email}</span>
          </div>
          <div className="invoice-contact-row">
            <img src={asset('icon-2.png')} alt="" className="invoice-contact-icon" />
            <span>{COMPANY_INVOICE.address}<br />{COMPANY_INVOICE.city}</span>
          </div>
        </div>
      </header>

      <div className="invoice-red-line" />
      <p className="invoice-gst-below">GST NO: {COMPANY_INVOICE.gstNumber}</p>

      <section className="invoice-body">
        <div className="invoice-meta-row">
          <h2 className="invoice-tax-title">JOB CARD</h2>
          <div className="invoice-meta-details">
            <p><span>Job No:</span> <strong>{job.jobNumber}</strong></p>
            <p><span>Date:</span> <strong>{formatDate(job.receivedDate || new Date().toISOString())}</strong></p>
            <p><span>Status:</span> <strong>{formatStatus(job.status)}</strong></p>
          </div>
        </div>

        <div className="invoice-bill-to">
          <div>
            <p className="invoice-label">Customer</p>
            <p className="invoice-value">{job.customer?.name || '—'}</p>
            <p className="invoice-sub">Phone: {job.customer?.phone || '—'}</p>
            <p className="invoice-sub">Email: {job.customer?.email || '—'}</p>
            <p className="invoice-sub">
              Type: <strong>{dealerLabel(job)}</strong>
              {job.jobCategory ? ` · ${formatJobCategory(job.jobCategory)}` : ''}
            </p>
          </div>
          <div>
            <p className="invoice-label">Vehicle</p>
            <p className="invoice-value font-mono">{job.vehicle?.registrationNo || '—'}</p>
            {job.vehicle && (
              <p className="invoice-sub">{job.vehicle.make} {job.vehicle.model}</p>
            )}
            {job.vehicle?.colour && (
              <p className="invoice-sub">Colour: {job.vehicle.colour}</p>
            )}
            {job.jobType && (
              <p className="invoice-sub">Job type: {formatJobType(job.jobType)}</p>
            )}
            {job.dueDate && (
              <p className="invoice-sub">Due: {formatDate(job.dueDate)}</p>
            )}
            {job.assignedTechnician && (
              <p className="invoice-sub">
                Technician: {job.assignedTechnician.firstName} {job.assignedTechnician.lastName}
              </p>
            )}
          </div>
        </div>

        <table className="invoice-items-table">
          <thead>
            <tr>
              <th className="text-left">#</th>
              <th className="text-left">Job detail</th>
              <th className="text-left">Type</th>
              <th className="text-right">Price (NZD)</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>No job details recorded</td>
              </tr>
            ) : (
              lines.map((item, index) => (
                <tr key={item.id || `${item.description}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.description || '—'}</td>
                  <td>{item.taskType ? formatSubTaskType(item.taskType) : '—'}</td>
                  <td className="text-right">
                    {item.price != null && item.price !== ''
                      ? formatCurrency(Number(item.price))
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {job.description && job.subTasks && job.subTasks.length > 0 && (
          <p className="invoice-notes"><strong>Notes:</strong> {job.description}</p>
        )}

        <div className="invoice-totals">
          <div className="invoice-totals-box">
            {addGst ? (
              <>
                <div className="invoice-total-row">
                  <span>Subtotal (ex GST)</span>
                  <span>{formatCurrency(price.subtotal)}</span>
                </div>
                <div className="invoice-total-row">
                  <span>GST (15%)</span>
                  <span>{formatCurrency(price.gst)}</span>
                </div>
                <div className="invoice-total-row invoice-total-grand">
                  <span>Total (incl. GST)</span>
                  <span>{formatCurrency(price.total)}</span>
                </div>
              </>
            ) : (
              <div className="invoice-total-row invoice-total-grand">
                <span>Total</span>
                <span>{price.entered > 0 ? formatCurrency(price.total) : '—'}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="invoice-bottom-area">
        <img src={asset('bottom-bar.png')} alt="" className="invoice-bottom-bar" />
      </div>

      <p className="invoice-nzbn">NZBN: {COMPANY_INVOICE.nzbn}</p>
    </div>
  );
}
