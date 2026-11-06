import "server-only";
import type { DocumentSeries, Prisma } from "@prisma/client";

/** Default format for each kind of numbered document. Admins can change them under Setup → Document numbering. */
export type SeriesDefaults = Pick<DocumentSeries, "name" | "prefix" | "perBranch" | "yearly"> & { padding?: number };

export const BUILT_IN_SERIES: Record<string, SeriesDefaults> = {
  StockMovement: { name: "Stock movements", prefix: "MOV", perBranch: true, yearly: true },
  SalesInvoice: { name: "Sales invoices", prefix: "INV", perBranch: true, yearly: true },
  Payment: { name: "Payments received", prefix: "PAY", perBranch: true, yearly: true },
  CashEntry: { name: "Cash book entries", prefix: "CSH", perBranch: true, yearly: true },
  JournalEntry: { name: "Journal entries", prefix: "JE", perBranch: true, yearly: true },
  PurchaseOrder: { name: "Purchase orders", prefix: "PO", perBranch: true, yearly: true },
  GoodsReceipt: { name: "Receiving reports", prefix: "RR", perBranch: true, yearly: true },
  SupplierBill: { name: "Supplier bills (AP vouchers)", prefix: "APV", perBranch: true, yearly: true },
  SupplierPayment: { name: "Payments made (check vouchers)", prefix: "CV", perBranch: true, yearly: true },
};

/** Series for an admin-built record type with an "Auto number" field. Custom records have no branch. */
export const customSeriesType = (entityId: string) => `custom:${entityId}`;

type Format = Pick<DocumentSeries, "prefix" | "padding" | "perBranch" | "yearly">;

/** e.g. MOV-MNL-2026-000123; the branch and year parts are left out when the series does not use them. */
export function formatNumber(series: Format, branchCode: string, year: number, n: number) {
  return [series.prefix, series.perBranch && branchCode, series.yearly && year, String(n).padStart(series.padding, "0")]
    .filter(Boolean)
    .join("-");
}

/** Creates the series with its defaults if it does not exist yet; never changes an existing one. */
export async function ensureSeries(tx: Prisma.TransactionClient, docType: string, defaults: SeriesDefaults) {
  return tx.documentSeries.upsert({ where: { docType }, create: { docType, ...defaults }, update: {} });
}

/**
 * Takes the next number of a series. Call it inside the transaction that saves the document:
 * the counter increment rolls back with it, so numbers stay gap-free.
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  docType: string,
  { branchCode = "", date = new Date(), defaults }: { branchCode?: string; date?: Date; defaults?: SeriesDefaults } = {},
) {
  const fallback = defaults ?? BUILT_IN_SERIES[docType];
  const series =
    (await tx.documentSeries.findUnique({ where: { docType } })) ??
    (fallback ? await ensureSeries(tx, docType, fallback) : null);
  if (!series) throw new Error(`No document series "${docType}"`);

  const key = { docType, branchCode: series.perBranch ? branchCode : "", year: series.yearly ? date.getFullYear() : 0 };
  // Atomic increment: concurrent saves each get their own number.
  const counter = await tx.documentCounter.upsert({
    where: { docType_branchCode_year: key },
    create: { ...key, next: 2 },
    update: { next: { increment: 1 } },
  });
  return formatNumber(series, key.branchCode, key.year, counter.next - 1);
}
