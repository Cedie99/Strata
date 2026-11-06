import { Prisma } from "@prisma/client";

// Amounts in words, as written on Philippine checks and vouchers:
// 1234.5 → "One Thousand Two Hundred Thirty-Four Pesos and 50/100 Only".

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

/** 0–999 in words ("" for 0). */
function hundreds(n: number) {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
  const rest = n % 100;
  if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(" ");
}

/** A whole number in words, e.g. 1005 → "One Thousand Five". */
export function integerInWords(value: bigint): string {
  if (value === BigInt(0)) return "Zero";
  const groups: string[] = [];
  let n = value;
  let scale = 0;
  while (n > BigInt(0)) {
    const chunk = Number(n % BigInt(1000));
    if (chunk) groups.unshift(`${hundreds(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    n /= BigInt(1000);
    scale++;
  }
  return groups.join(" ");
}

/** "One Thousand Pesos and 50/100 Only"; the currency name follows the company currency. */
export function amountInWords(amount: Prisma.Decimal.Value, currency = "PHP") {
  const d = new Prisma.Decimal(amount).abs().toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const whole = BigInt(d.floor().toFixed(0));
  const cents = d.minus(d.floor()).times(100).toFixed(0).padStart(2, "0");
  const unit = currency === "PHP" ? (whole === BigInt(1) ? "Peso" : "Pesos") : currency;
  return `${integerInWords(whole)} ${unit} and ${cents}/100 Only`;
}
