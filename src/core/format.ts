import type { Prisma } from "@prisma/client";

type Num = Prisma.Decimal | string | number;

export function formatMoney(value: Num, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(Number(value.toString()));
}

export function formatQty(value: Num) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 }).format(Number(value.toString()));
}

export function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(d);
}

/** Local calendar day as YYYY-MM-DD, the value of an <input type="date">. */
export const toDateInput = (d: Date) => d.toLocaleDateString("en-CA");

export function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}
