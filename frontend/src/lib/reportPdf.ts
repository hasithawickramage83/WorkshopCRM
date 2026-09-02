import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate, formatStatus } from './types';

export interface JobsPdfRow {
  customerName: string;
  dealerLabel: string;
  registrationNo: string;
  createdAt: string;
  status: string;
  description: string;
  amount: number;
}

export interface DealerGroupPdf {
  customerName: string;
  jobCount: number;
  totalAmount: number;
  jobs: JobsPdfRow[];
}

function periodLabel(from?: string, to?: string) {
  const fromText = from ? formatDate(from) : '—';
  const toText = to ? formatDate(to) : '—';
  return `${fromText} to ${toText}`;
}

function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

/** Flat jobs report PDF — sorted by customer name */
export function downloadJobsReportPdf(options: {
  rows: JobsPdfRow[];
  from?: string;
  to?: string;
  categoryLabel?: string;
  totalAmount?: number;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const title = 'Jobs Report';
  const subtitle = [
    periodLabel(options.from, options.to),
    options.categoryLabel || 'All Categories',
  ].join(' · ');

  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(subtitle, 14, 22);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 28,
    head: [['Customer', 'Dealer?', 'Rego', 'Date', 'Status', 'Description', 'Amount']],
    body: options.rows.map((row) => [
      row.customerName || '—',
      row.dealerLabel || '—',
      row.registrationNo || '—',
      formatDate(row.createdAt),
      formatStatus(row.status),
      row.description || '—',
      formatCurrency(row.amount),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: 24 },
      4: { cellWidth: 28 },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 28, halign: 'right' },
    },
    didDrawPage: (data) => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Ceylon Automobile CRM · Page ${data.pageNumber}/${page}`,
        14,
        doc.internal.pageSize.getHeight() - 8,
      );
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 28;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(
    `Total jobs: ${options.rows.length}   Total amount: ${formatCurrency(options.totalAmount ?? options.rows.reduce((s, r) => s + r.amount, 0))}`,
    14,
    finalY + 8,
  );

  savePdf(doc, `jobs-report-${options.from || 'all'}-to-${options.to || 'all'}.pdf`);
}

/** Dealer-wise grouped PDF */
export function downloadDealerWiseReportPdf(options: {
  groups: DealerGroupPdf[];
  from?: string;
  to?: string;
  totalAmount?: number;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Dealer-wise Jobs Report', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(periodLabel(options.from, options.to), 14, 22);
  doc.setTextColor(0);

  const body: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];

  for (const group of options.groups) {
    body.push([
      {
        content: `${group.customerName}  (${group.jobCount} job${group.jobCount === 1 ? '' : 's'} · ${formatCurrency(group.totalAmount)})`,
        colSpan: 7,
        styles: { fillColor: [226, 232, 240], fontStyle: 'bold', textColor: [15, 23, 42] },
      },
    ]);
    for (const row of group.jobs) {
      body.push([
        row.customerName || '—',
        'Dealer',
        row.registrationNo || '—',
        formatDate(row.createdAt),
        formatStatus(row.status),
        row.description || '—',
        formatCurrency(row.amount),
      ]);
    }
  }

  if (body.length === 0) {
    body.push([{ content: 'No dealer jobs in this period', colSpan: 7, styles: { halign: 'center' } }]);
  }

  autoTable(doc, {
    startY: 28,
    head: [['Customer', 'Dealer?', 'Rego', 'Date', 'Status', 'Description', 'Amount']],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: 24 },
      4: { cellWidth: 28 },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 28, halign: 'right' },
    },
    didDrawPage: (data) => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Ceylon Automobile CRM · Dealer-wise · Page ${data.pageNumber}/${page}`,
        14,
        doc.internal.pageSize.getHeight() - 8,
      );
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 28;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(
    `Dealers: ${options.groups.length}   Dealer jobs amount: ${formatCurrency(options.totalAmount ?? options.groups.reduce((s, g) => s + g.totalAmount, 0))}`,
    14,
    finalY + 8,
  );

  savePdf(doc, `dealer-wise-report-${options.from || 'all'}-to-${options.to || 'all'}.pdf`);
}

export interface FinancePeriodReportPdf {
  from?: string;
  to?: string;
  summary: {
    jobsReceived: number;
    jobsOut: number;
    totalPaymentsReceived: number;
    cashCollected: number;
    otherPaymentsCollected: number;
    totalExpenses: number;
    totalPayables?: number;
    labourExpenses: number;
    materialExpenses: number;
    otherExpenses: number;
    netProfit: number;
    isProfit: boolean;
  };
  jobsReceived: {
    date?: string | null;
    jobNumber?: string;
    customer?: string;
    registrationNo?: string;
    status?: string;
    amount?: number;
  }[];
  jobsOut: {
    date?: string | null;
    jobNumber?: string;
    customer?: string;
    registrationNo?: string;
    detail?: string;
    status?: string;
    amount?: number;
    amountPaid?: number;
    balance?: number;
    paymentLabel?: string;
  }[];
  collections: {
    date?: string | null;
    jobNumber?: string;
    customer?: string;
    registrationNo?: string;
    description?: string | null;
    collectionType?: string;
    paymentMethod?: string | null;
    amount: number;
  }[];
  expenses: {
    date?: string | null;
    category?: string;
    description?: string;
    paymentMethod?: string | null;
    amount: number;
  }[];
  payables?: {
    date?: string | null;
    category?: string;
    description?: string;
    supplier?: string | null;
    reference?: string | null;
    paymentMethod?: string | null;
    amount: number;
  }[];
}

function pdfFooter(doc: jsPDF, label: string) {
  const page = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Ceylon Automobile CRM · ${label} · Page ${page}`,
    14,
    doc.internal.pageSize.getHeight() - 8,
  );
  doc.setTextColor(0);
}

function nextTableStartY(doc: jsPDF, gap = 12) {
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 28;
  const pageH = doc.internal.pageSize.getHeight();
  if (finalY + gap + 30 > pageH - 12) {
    doc.addPage();
    return 16;
  }
  return finalY + gap;
}

/** Finance period report PDF with detail lists and profit summary */
export function downloadFinancePeriodReportPdf(report: FinancePeriodReportPdf) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const s = report.summary;

  doc.setFontSize(16);
  doc.text('Finance Period Report', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(periodLabel(report.from, report.to), 14, 22);
  doc.setTextColor(0);

  doc.setFontSize(11);
  doc.text('Summary', 14, 32);
  autoTable(doc, {
    startY: 36,
    head: [['Metric', 'Value']],
    body: [
      ['Jobs received', String(s.jobsReceived)],
      ['Jobs out', String(s.jobsOut)],
      ['Total collection', formatCurrency(s.totalPaymentsReceived)],
      ['  Cash', formatCurrency(s.cashCollected)],
      ['  Other payments', formatCurrency(s.otherPaymentsCollected)],
      ['Total expenses', formatCurrency(s.totalExpenses)],
      ['  Labour', formatCurrency(s.labourExpenses)],
      ['  Materials', formatCurrency(s.materialExpenses)],
      ['  Other', formatCurrency(s.otherExpenses)],
      ['Total payables', formatCurrency(s.totalPayables || 0)],
      [
        s.isProfit ? 'Net profit' : 'Net loss',
        formatCurrency(s.netProfit),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 40, halign: 'right' },
    },
    didDrawPage: () => pdfFooter(doc, 'Finance report'),
  });

  let y = nextTableStartY(doc, 14);
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(`Jobs received (${report.jobsReceived.length})`, 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Job', 'Customer', 'Rego', 'Status', 'Price']],
    body: report.jobsReceived.length
      ? report.jobsReceived.map((r) => [
          r.date ? formatDate(r.date) : '—',
          r.jobNumber || '—',
          r.customer || '—',
          r.registrationNo || '—',
          formatStatus(r.status || ''),
          (r.amount || 0) > 0 ? formatCurrency(r.amount || 0) : '—',
        ])
      : [['—', 'No jobs received', '—', '—', '—', '—']],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: { 5: { halign: 'right' } },
    didDrawPage: () => pdfFooter(doc, 'Finance report'),
  });

  y = nextTableStartY(doc, 14);
  doc.setFontSize(11);
  doc.text(`Jobs out (${report.jobsOut.length})`, 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Out date', 'Job', 'Customer', 'Rego', 'Invoice', 'Status', 'Price', 'Paid']],
    body: report.jobsOut.length
      ? report.jobsOut.map((r) => [
          r.date ? formatDate(r.date) : '—',
          r.jobNumber || '—',
          r.customer || '—',
          r.registrationNo || '—',
          r.detail || '—',
          formatStatus(r.status || ''),
          (r.amount || 0) > 0 ? formatCurrency(r.amount || 0) : '—',
          formatCurrency(r.amountPaid || 0),
        ])
      : [['—', 'No jobs out', '—', '—', '—', '—', '—', '—']],
    styles: { fontSize: 7.5, cellPadding: 1.2 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255 },
    columnStyles: {
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    didDrawPage: () => pdfFooter(doc, 'Finance report'),
  });

  y = nextTableStartY(doc, 14);
  doc.setFontSize(11);
  doc.text(`Collections (${report.collections.length}) · ${formatCurrency(s.totalPaymentsReceived)}`, 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Job / Inv', 'Customer', 'Rego', 'Type', 'Method', 'Amount']],
    body: report.collections.length
      ? report.collections.map((r) => [
          r.date ? formatDate(r.date) : '—',
          r.jobNumber || '—',
          r.customer || '—',
          r.registrationNo || '—',
          (r.collectionType || '—').replace(/_/g, ' '),
          (r.paymentMethod || '—').replace(/_/g, ' '),
          formatCurrency(r.amount),
        ])
      : [['—', 'No collections', '—', '—', '—', '—', '—']],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    columnStyles: { 6: { halign: 'right' } },
    didDrawPage: () => pdfFooter(doc, 'Finance report'),
  });

  y = nextTableStartY(doc, 14);
  doc.setFontSize(11);
  doc.text(`Expenses (${report.expenses.length}) · ${formatCurrency(s.totalExpenses)}`, 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Category', 'Description', 'Method', 'Amount']],
    body: report.expenses.length
      ? report.expenses.map((r) => [
          r.date ? formatDate(r.date) : '—',
          (r.category || '—').replace(/_/g, ' '),
          r.description || '—',
          (r.paymentMethod || '—').replace(/_/g, ' '),
          formatCurrency(r.amount),
        ])
      : [['—', 'No expenses', '—', '—', '—']],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [217, 119, 6], textColor: 255 },
    columnStyles: { 4: { halign: 'right' } },
    didDrawPage: () => pdfFooter(doc, 'Finance report'),
  });

  const payables = report.payables || [];
  y = nextTableStartY(doc, 14);
  doc.setFontSize(11);
  doc.text(`Payables (${payables.length}) · ${formatCurrency(s.totalPayables || 0)}`, 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Category', 'Supplier', 'Description', 'Amount']],
    body: payables.length
      ? payables.map((r) => [
          r.date ? formatDate(r.date) : '—',
          (r.category || '—').replace(/_/g, ' '),
          r.supplier || '—',
          r.description || '—',
          formatCurrency(r.amount),
        ])
      : [['—', 'No payables', '—', '—', '—']],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    columnStyles: { 4: { halign: 'right' } },
    didDrawPage: () => pdfFooter(doc, 'Finance report'),
  });

  y = nextTableStartY(doc, 16);
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text('End summary', 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['', 'Amount']],
    body: [
      ['Total jobs received', String(s.jobsReceived)],
      ['Total jobs out', String(s.jobsOut)],
      ['Total collection', formatCurrency(s.totalPaymentsReceived)],
      ['Total expenses', formatCurrency(s.totalExpenses)],
      ['Total payables', formatCurrency(s.totalPayables || 0)],
      [
        s.isProfit ? 'Profit' : 'Loss',
        formatCurrency(s.netProfit),
      ],
    ],
    styles: { fontSize: 10, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    bodyStyles: { fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 40, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === 5) {
        data.cell.styles.textColor = s.isProfit ? [22, 101, 52] : [153, 27, 27];
      }
    },
    didDrawPage: () => pdfFooter(doc, 'Finance report'),
  });

  const fromKey = (report.from || 'all').slice(0, 10);
  const toKey = (report.to || 'all').slice(0, 10);
  savePdf(doc, `finance-report-${fromKey}-to-${toKey}.pdf`);
}
