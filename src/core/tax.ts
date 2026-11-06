// Philippine tax rules shared by Sales, Purchasing and the BIR reports. Amounts on lines are net of VAT.
// Safe to import from client forms; the Decimal arithmetic is in tax-math.ts.

/** VAT treatment of a sale or purchase line. */
export const VAT_CODES = [
  { value: "VAT", label: "VATable 12%" },
  { value: "ZERO", label: "Zero-rated" },
  { value: "EXEMPT", label: "Exempt / non-VAT" },
] as const;
export type VatCode = (typeof VAT_CODES)[number]["value"];
export const VAT_RATE = 0.12;
export const isVatCode = (v: string): v is VatCode => VAT_CODES.some((c) => c.value === v);

/**
 * Common expanded / creditable withholding rates (percent) with their BIR ATC for corporate payees.
 * Used for withholding on supplier payments (EWT) and for what customers withhold from us (CWT).
 */
export const WITHHOLDING_PRESETS = [
  { value: "0", label: "None", atc: "" },
  { value: "1", label: "1% · goods (top withholding agents)", atc: "WC158" },
  { value: "2", label: "2% · services (top withholding agents)", atc: "WC160" },
  { value: "5", label: "5% · rentals", atc: "WC100" },
  { value: "10", label: "10% · professional fees", atc: "WC010" },
  { value: "15", label: "15% · professional fees (over threshold)", atc: "WC011" },
] as const;

/** What an ATC stands for, for the QAP, SAWT and Form 2307. */
export const ATC_DESCRIPTIONS: Record<string, string> = {
  WC158: "Purchase of goods by top withholding agents",
  WC160: "Purchase of services by top withholding agents",
  WC100: "Rentals of real or personal property",
  WC010: "Professional fees (gross income up to ₱3M)",
  WC011: "Professional fees (gross income over ₱3M)",
};

/** Calendar quarter of a date, e.g. "2026-Q4". */
export const quarterOf = (d: Date) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;

/** The first day of a quarter and the day after it ends (local midnight), plus its three months. */
export function quarterRange(q: string | undefined, fallback = new Date()) {
  const m = /^(\d{4})-Q([1-4])$/.exec(q ?? "");
  const year = m ? Number(m[1]) : fallback.getFullYear();
  const n = m ? Number(m[2]) : Math.floor(fallback.getMonth() / 3) + 1;
  const from = new Date(year, (n - 1) * 3, 1);
  const to = new Date(year, n * 3, 1);
  const months = [0, 1, 2].map((i) => new Date(year, (n - 1) * 3 + i, 1));
  return { key: `${year}-Q${n}`, year, quarter: n, from, to, months, last: new Date(year, n * 3, 0) };
}

/** The last eight quarters up to the current one, newest first, for a picker. */
export function recentQuarters(now = new Date()) {
  const out: string[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    out.push(`${y}-Q${q}`);
    q--;
    if (q === 0) {
      q = 4;
      y--;
    }
  }
  return out;
}

/** TIN digits only, padded to 9 (+ branch code), as the BIR files expect: 123456789 and 0000. */
export function splitTin(tin: string) {
  const digits = tin.replace(/\D/g, "");
  return { tin: digits.slice(0, 9), branch: (digits.slice(9) || "0").padStart(4, "0").slice(-4) };
}
