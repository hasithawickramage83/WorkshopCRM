import {
  COMPANY_INVOICE, formatCurrency, formatDate, formatSubTaskType,
} from '../lib/types';

const ASSETS = '/invoice-assets';
const ASSET_VERSION = '20260709';
const asset = (name: string) => `${ASSETS}/${name}?v=${ASSET_VERSION}`;

export interface InvoicePrintLineItem {
  id: string;
  description: string;
  taskType?: string | null;
  unitPrice?: number | string;
  quantity?: number | string;
  lineTotal: number | string;
}

export interface InvoicePrintData {
  invoiceNumber: string;
  subtotal: number | string;
  gst: number | string;
  discount: number | string;
  total: number | string;
  amountPaid: number | string;
  includeGst?: boolean;
  notes?: string | null;
  createdAt: string;
  customer?: { name: string; phone?: string; email?: string; address?: string };
  job?: {
    jobNumber: string;
    vehicle?: { registrationNo: string; make: string; model: string };
  };
  lineItems?: InvoicePrintLineItem[];
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Cash invoice display: one cash figure — no GST split (legacy invoices may still have ex-GST lines). */
function cashPrintAmounts(invoice: InvoicePrintData) {
  const total = Number(invoice.total || 0);
  const discount = Number(invoice.discount || 0);
  const gst = Number(invoice.gst || 0);
  const rawLines = invoice.lineItems?.length
    ? invoice.lineItems
    : [{
        id: 'base',
        description: invoice.job?.jobNumber ? `Job ${invoice.job.jobNumber}` : 'Workshop services',
        taskType: null,
        unitPrice: invoice.subtotal,
        lineTotal: invoice.subtotal,
      }];
  const lineSum = rawLines.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const needsGross = gst > 0 && lineSum > 0 && Math.abs(lineSum - total) > 0.009;
  const scale = needsGross ? total / lineSum : 1;
  const lineItems = rawLines.map((item) => ({
    ...item,
    unitPrice: roundMoney(Number(item.unitPrice ?? item.lineTotal ?? 0) * scale),
    lineTotal: roundMoney(Number(item.lineTotal || 0) * scale),
  }));
  return {
    lineItems,
    discount,
    /** Pre-discount cash amount when a discount applies */
    cashSubtotal: roundMoney(total + discount),
    total,
    amountPaid: Number(invoice.amountPaid || 0),
  };
}

export default function InvoicePrintTemplate({ invoice }: { invoice: InvoicePrintData }) {
  const { lineItems, discount, cashSubtotal, total, amountPaid } = cashPrintAmounts(invoice);

  return (
    <div id="invoice-print" className="invoice-sheet">
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

      <section className="invoice-body">
        <div className="invoice-meta-row">
          <h2 className="invoice-tax-title">CASH INVOICE</h2>
          <div className="invoice-meta-details">
            <p><span>Invoice No:</span> <strong>{invoice.invoiceNumber}</strong></p>
            <p><span>Date:</span> <strong>{formatDate(invoice.createdAt)}</strong></p>
          </div>
        </div>

        <div className="invoice-bill-to">
          <div>
            <p className="invoice-label">Bill To</p>
            <p className="invoice-value">{invoice.customer?.name || '—'}</p>
            {invoice.customer?.phone && <p className="invoice-sub">{invoice.customer.phone}</p>}
            {invoice.customer?.address && <p className="invoice-sub">{invoice.customer.address}</p>}
          </div>
          <div>
            <p className="invoice-label">Vehicle</p>
            <p className="invoice-value font-mono">{invoice.job?.vehicle?.registrationNo || '—'}</p>
            {invoice.job?.vehicle && (
              <p className="invoice-sub">{invoice.job.vehicle.make} {invoice.job.vehicle.model}</p>
            )}
            {invoice.job?.jobNumber && (
              <p className="invoice-sub">Job: {invoice.job.jobNumber}</p>
            )}
          </div>
        </div>

        <table className="invoice-items-table">
          <thead>
            <tr>
              <th className="text-left">Description</th>
              <th className="text-left">Type</th>
              <th className="text-right">Amount (NZD)</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.taskType ? formatSubTaskType(item.taskType) : '—'}</td>
                <td className="text-right">{formatCurrency(Number(item.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="invoice-totals-box">
            {discount > 0 && (
              <>
                <div className="invoice-total-row">
                  <span>Amount</span>
                  <span>{formatCurrency(cashSubtotal)}</span>
                </div>
                <div className="invoice-total-row">
                  <span>Discount</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              </>
            )}
            <div className="invoice-total-row invoice-total-grand">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="invoice-total-row invoice-total-paid">
              <span>Amount Paid</span>
              <span>{formatCurrency(amountPaid)}</span>
            </div>
            {amountPaid < total && (
              <div className="invoice-total-row">
                <span>Balance Due</span>
                <span>{formatCurrency(total - amountPaid)}</span>
              </div>
            )}
          </div>
        </div>

        {invoice.notes && (
          <p className="invoice-notes"><strong>Notes:</strong> {invoice.notes}</p>
        )}
      </section>

      <footer className="invoice-footer">
        <div className="invoice-payment-block">
          <p className="invoice-payment-title">Payment Details</p>
          <table className="invoice-payment-table">
            <tbody>
              <tr>
                <th>Bank Name</th>
                <td>{COMPANY_INVOICE.bankName}</td>
              </tr>
              <tr>
                <th>Account Name</th>
                <td>{COMPANY_INVOICE.bankAccountName}</td>
              </tr>
              <tr>
                <th>Account Number</th>
                <td>{COMPANY_INVOICE.bankAccountNumber}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </footer>

      <div className="invoice-bottom-area">
        <img src={asset('bottom-bar.png')} alt="" className="invoice-bottom-bar" />
      </div>

      <p className="invoice-nzbn">NZBN: {COMPANY_INVOICE.nzbn}</p>
    </div>
  );
}
