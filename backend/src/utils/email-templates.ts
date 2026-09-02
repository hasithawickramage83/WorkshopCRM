import { config } from './config';

export interface QuotationEmailData {
  quotationNumber: string;
  customerName: string;
  labour: number;
  parts: number;
  paint: number;
  discount: number;
  gst: number;
  total: number;
  validUntil: string;
  jobNumber?: string;
  notes?: string;
  items: { description: string; quantity: number; unitPrice: number; totalPrice: number }[];
}

function money(amount: number): string {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount);
}

export function buildQuotationPlainText(data: QuotationEmailData): string {
  const lines: string[] = [
    'CEYLON AUTOMOBILE',
    'West Panel, Paint & Tyres',
    '──────────────────────────────────────',
    '',
    `Quotation Number: ${data.quotationNumber}`,
    data.jobNumber ? `Job Reference: ${data.jobNumber}` : '',
    '',
    `Dear ${data.customerName},`,
    '',
    'Thank you for choosing Ceylon Automobile. We appreciate the opportunity to service your vehicle.',
    '',
    'Please find your detailed repair quotation below:',
    '',
  ].filter(Boolean);

  if (data.items.length > 0) {
    lines.push('SCOPE OF WORK');
    lines.push('──────────────────────────────────────');
    data.items.forEach((item) => {
      lines.push(`• ${item.description}`);
      lines.push(`  Qty: ${item.quantity}  |  Unit: ${money(item.unitPrice)}  |  Total: ${money(item.totalPrice)}`);
    });
    lines.push('');
  }

  lines.push(
    'PRICING SUMMARY',
    '──────────────────────────────────────',
    `Labour:              ${money(data.labour)}`,
    `Parts:               ${money(data.parts)}`,
    `Paint:               ${money(data.paint)}`,
  );

  if (data.discount > 0) {
    lines.push(`Discount:            -${money(data.discount)}`);
  }

  lines.push(
    `GST (15%):           ${money(data.gst)}`,
    '──────────────────────────────────────',
    `TOTAL (NZD):         ${money(data.total)}`,
    '',
    `This quotation is valid until: ${data.validUntil}`,
  );

  if (data.notes) {
    lines.push('', 'ADDITIONAL NOTES', '──────────────────────────────────────', data.notes);
  }

  lines.push(
    '',
    'HOW TO PROCEED',
    '──────────────────────────────────────',
    'To approve this quotation, simply reply to this email or contact our workshop.',
    'We will begin work once your approval is received.',
    '',
    'Kind regards,',
    'Ceylon Automobile Team',
    'West Panel, Paint & Tyres',
    config.email.from,
    '',
    '──────────────────────────────────────',
    'This is an automated quotation from Ceylon Automobile CRM.',
  );

  return lines.join('\n');
}

export function buildQuotationHtml(data: QuotationEmailData): string {
  const itemsRows = data.items.length
    ? data.items.map((item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${escapeHtml(item.description)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#374151;">${item.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151;">${money(item.unitPrice)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827;">${money(item.totalPrice)}</td>
        </tr>`).join('')
    : '';

  const itemsSection = data.items.length ? `
    <h2 style="margin:28px 0 12px;font-size:16px;color:#1e40af;font-weight:700;">Scope of Work</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;">Description</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#64748b;text-transform:uppercase;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;">Unit Price</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>` : '';

  const discountRow = data.discount > 0
    ? `<tr><td style="padding:8px 0;color:#64748b;">Discount</td><td style="padding:8px 0;text-align:right;color:#dc2626;">-${money(data.discount)}</td></tr>`
    : '';

  const notesSection = data.notes ? `
    <div style="margin-top:24px;padding:16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;">Additional Notes</p>
      <p style="margin:0;font-size:14px;color:#78350f;line-height:1.5;">${escapeHtml(data.notes)}</p>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:700;letter-spacing:-0.5px;">Ceylon Automobile</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#bfdbfe;">West Panel, Paint &amp; Tyres</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 4px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Repair Quotation</p>
            <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#1e293b;">${escapeHtml(data.quotationNumber)}</p>

            <p style="margin:0 0 8px;font-size:16px;color:#334155;">Dear <strong>${escapeHtml(data.customerName)}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              Thank you for choosing <strong>Ceylon Automobile</strong>. We appreciate the opportunity to service your vehicle
              and have prepared the following quotation for your review.
            </p>

            ${data.jobNumber ? `<p style="margin:0 0 20px;font-size:14px;color:#64748b;">Job Reference: <strong style="color:#334155;">${escapeHtml(data.jobNumber)}</strong></p>` : ''}

            ${itemsSection}

            <!-- Pricing -->
            <h2 style="margin:28px 0 12px;font-size:16px;color:#1e40af;font-weight:700;">Pricing Summary</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:4px 20px;">
              <tr><td style="padding:8px 0;color:#64748b;">Labour</td><td style="padding:8px 0;text-align:right;color:#334155;">${money(data.labour)}</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;">Parts</td><td style="padding:8px 0;text-align:right;color:#334155;">${money(data.parts)}</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;">Paint</td><td style="padding:8px 0;text-align:right;color:#334155;">${money(data.paint)}</td></tr>
              ${discountRow}
              <tr><td style="padding:8px 0;color:#64748b;">GST (15%)</td><td style="padding:8px 0;text-align:right;color:#334155;">${money(data.gst)}</td></tr>
              <tr>
                <td style="padding:12px 0 8px;font-size:16px;font-weight:700;color:#1e293b;border-top:2px solid #e2e8f0;">Total (NZD)</td>
                <td style="padding:12px 0 8px;text-align:right;font-size:20px;font-weight:700;color:#1e40af;border-top:2px solid #e2e8f0;">${money(data.total)}</td>
              </tr>
            </table>

            <p style="margin:20px 0 0;font-size:13px;color:#64748b;">
              Valid until: <strong style="color:#334155;">${escapeHtml(data.validUntil)}</strong>
            </p>

            ${notesSection}

            <!-- CTA -->
            <div style="margin-top:32px;padding:24px;background:#eff6ff;border-radius:8px;text-align:center;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1e40af;">Ready to proceed?</p>
              <p style="margin:0;font-size:14px;color:#475569;line-height:1.5;">
                Reply to this email to approve the quotation, or contact our workshop team.<br>
                We will begin work once your approval is received.
              </p>
            </div>

            <p style="margin:32px 0 0;font-size:15px;color:#334155;line-height:1.6;">
              Kind regards,<br>
              <strong>Ceylon Automobile Team</strong><br>
              <span style="color:#64748b;font-size:14px;">West Panel, Paint &amp; Tyres</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              ${escapeHtml(config.email.from)} &nbsp;|&nbsp; Ceylon Automobile CRM
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
