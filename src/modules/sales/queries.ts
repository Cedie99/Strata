// Receivables aging, shared by the receivables list and the business dashboard.

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days past the due date (0 or negative = not due yet). */
export const daysOverdue = (dueDate: Date, today: Date) =>
  Math.round((startOfDay(today).getTime() - startOfDay(dueDate).getTime()) / DAY);

export const AGING_BUCKETS = [
  { key: "current", label: "Not due" },
  { key: "1-30", label: "1–30 days" },
  { key: "31-60", label: "31–60 days" },
  { key: "61-90", label: "61–90 days" },
  { key: "90+", label: "Over 90 days" },
] as const;

export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucket(days: number): AgingKey {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
