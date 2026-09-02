/**
 * Create JobCollection rows for invoice payments that were recorded
 * via amountPaid / Payment without a matching finance collection.
 *
 * Usage: npx tsx scripts/backfill-collections-from-invoices.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toNumber(v: unknown) {
  return Number(v || 0);
}

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      amountPaid: { gt: 0 },
      jobId: { not: null },
    },
    include: {
      collections: { where: { deletedAt: null }, select: { amount: true } },
      payments: { orderBy: { paidAt: 'asc' }, select: { amount: true, paymentMethod: true, paidAt: true, reference: true, notes: true } },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const inv of invoices) {
    const alreadyCollected = inv.collections.reduce((s, c) => s + toNumber(c.amount), 0);
    const paid = toNumber(inv.amountPaid);
    const gap = Math.round((paid - alreadyCollected) * 100) / 100;
    if (gap <= 0.009 || !inv.jobId) {
      skipped += 1;
      continue;
    }

    // Prefer using Payment ledger rows if they exist and cover the gap; else one synthetic collection
    const paymentSum = inv.payments.reduce((s, p) => s + toNumber(p.amount), 0);
    if (inv.payments.length && Math.abs(paymentSum - paid) < 0.02 && alreadyCollected < 0.01) {
      for (const p of inv.payments) {
        await prisma.jobCollection.create({
          data: {
            jobId: inv.jobId,
            invoiceId: inv.id,
            amount: p.amount,
            paymentMethod: (p.paymentMethod || 'OTHER').toUpperCase(),
            collectionType: 'OTHER',
            paidAt: p.paidAt,
            reference: p.reference,
            notes: p.notes || `Backfilled from invoice ${inv.invoiceNumber}`,
          },
        });
        created += 1;
      }
    } else {
      await prisma.jobCollection.create({
        data: {
          jobId: inv.jobId,
          invoiceId: inv.id,
          amount: gap,
          paymentMethod: 'OTHER',
          collectionType: 'OTHER',
          paidAt: inv.updatedAt || inv.createdAt,
          reference: inv.invoiceNumber,
          notes: `Backfilled from paid invoice ${inv.invoiceNumber}`,
        },
      });
      created += 1;
    }

    console.log(`Backfilled ${inv.invoiceNumber}: gap ${gap}`);
  }

  console.log(JSON.stringify({ invoicesChecked: invoices.length, collectionsCreated: created, skipped }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
