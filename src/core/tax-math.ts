import { Prisma } from "@prisma/client";
import { VAT_RATE } from "./tax";

const ZERO = new Prisma.Decimal(0);
const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** VAT on a net amount (12% for VATable lines, nothing for zero-rated or exempt). */
export const vatOf = (net: Prisma.Decimal, vatCode: string) => (vatCode === "VAT" ? money(net.times(VAT_RATE)) : ZERO);

/**
 * The tax base of a payment that settles part of a document: the paid share of its amount net of VAT.
 * Withholding is computed on income payments net of VAT.
 */
export const netShare = (applied: Prisma.Decimal, doc: { subtotal: Prisma.Decimal; total: Prisma.Decimal }) =>
  doc.total.isZero() ? ZERO : money(applied.times(doc.subtotal).div(doc.total));
