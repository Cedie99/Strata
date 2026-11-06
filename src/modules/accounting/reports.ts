import "server-only";
import { Prisma, type Account, type PrismaClient } from "@prisma/client";
import { db } from "@/core/db";
import { isDebitNormal } from "./module";

// Financial statements from the journal. Every report takes the branches to include (the title-bar scope)
// and works on accounting dates. Balances are Decimal internally and numbers in the result.
//
// Grouping follows the account codes: 1 assets, 2 liabilities, 3 equity, 40–48 revenue, 49 other income,
// 5 cost of sales, 6–9 operating expenses. The chart of accounts screen says so too.

type Client = PrismaClient | Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const n = (d: Prisma.Decimal) => Number(d.toFixed(2));

export type AccountBalance = { account: Account; debit: number; credit: number; balance: number };

/** Debit and credit totals per account for entries dated in [from, to). Accounts with no lines are left out. */
export async function accountTotals(branchIds: string[], { from, to }: { from?: Date; to?: Date }, client: Client = db) {
  const [sums, accounts] = await Promise.all([
    client.journalLine.groupBy({
      by: ["accountId"],
      where: { branchId: { in: branchIds }, entry: { date: { ...(from && { gte: from }), ...(to && { lt: to }) } } },
      _sum: { debit: true, credit: true },
    }),
    client.account.findMany({ orderBy: { code: "asc" } }),
  ]);
  const byId = new Map(sums.map((s) => [s.accountId, s._sum]));
  return accounts
    .filter((a) => byId.has(a.id))
    .map((account): AccountBalance => {
      const s = byId.get(account.id)!;
      const debit = s.debit ?? ZERO;
      const credit = s.credit ?? ZERO;
      // Balance on the account's normal side: assets and expenses debit-positive, the rest credit-positive.
      const balance = isDebitNormal(account.type) ? debit.minus(credit) : credit.minus(debit);
      return { account, debit: n(debit), credit: n(credit), balance: n(balance) };
    });
}

/** Trial balance at the end of a day: every account's balance in the debit or credit column. */
export async function trialBalance(branchIds: string[], asOf: Date, client: Client = db) {
  const rows = (await accountTotals(branchIds, { to: endOfDay(asOf) }, client))
    .map((r) => {
      const net = r.debit - r.credit;
      return { account: r.account, debit: net > 0 ? round(net) : 0, credit: net < 0 ? round(-net) : 0 };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);
  const totalDebit = round(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

const prefix = (a: Account) => Number(a.code.slice(0, 2)) || 0;
const sum = (rows: AccountBalance[]) => round(rows.reduce((s, r) => s + r.balance, 0));

/** Income statement for entries dated from `from` through the end of `to`. */
export async function incomeStatement(branchIds: string[], from: Date, to: Date, client: Client = db) {
  const totals = await accountTotals(branchIds, { from, to: endOfDay(to) }, client);
  const income = totals.filter((r) => r.account.type === "INCOME");
  const expense = totals.filter((r) => r.account.type === "EXPENSE");
  const revenue = income.filter((r) => prefix(r.account) < 49);
  const otherIncome = income.filter((r) => prefix(r.account) >= 49);
  const costOfSales = expense.filter((r) => r.account.code.startsWith("5"));
  const operating = expense.filter((r) => !r.account.code.startsWith("5"));
  const grossProfit = round(sum(revenue) - sum(costOfSales));
  const operatingIncome = round(grossProfit - sum(operating));
  return {
    sections: [
      { key: "revenue", label: "Revenue", rows: revenue, total: sum(revenue) },
      { key: "costOfSales", label: "Cost of sales", rows: costOfSales, total: sum(costOfSales) },
      { key: "operating", label: "Operating expenses", rows: operating, total: sum(operating) },
      { key: "otherIncome", label: "Other income", rows: otherIncome, total: sum(otherIncome) },
    ],
    grossProfit,
    operatingIncome,
    netIncome: round(operatingIncome + sum(otherIncome)),
  };
}

/**
 * Balance sheet at the end of a day. The books are not closed into retained earnings, so equity shows
 * earnings of earlier years (added to retained earnings) and this year's net income on their own lines.
 */
export async function balanceSheet(branchIds: string[], asOf: Date, client: Client = db) {
  const yearStart = new Date(asOf.getFullYear(), 0, 1);
  const [totals, priorYears, thisYear] = await Promise.all([
    accountTotals(branchIds, { to: endOfDay(asOf) }, client),
    accountTotals(branchIds, { to: yearStart }, client),
    incomeStatement(branchIds, yearStart, asOf, client),
  ]);
  const profit = (rows: AccountBalance[]) =>
    round(rows.reduce((s, r) => s + (r.account.type === "INCOME" ? r.balance : r.account.type === "EXPENSE" ? -r.balance : 0), 0));
  const assets = totals.filter((r) => r.account.type === "ASSET" && r.balance !== 0);
  const liabilities = totals.filter((r) => r.account.type === "LIABILITY" && r.balance !== 0);
  const equity = totals.filter((r) => r.account.type === "EQUITY" && r.balance !== 0);
  const earlierEarnings = profit(priorYears);
  const totalEquity = round(sum(equity) + earlierEarnings + thisYear.netIncome);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  return {
    assets,
    liabilities,
    equity,
    earlierEarnings,
    netIncome: thisYear.netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === round(totalLiabilities + totalEquity),
  };
}

/** One account's lines in [from, to] with a running balance, starting from its balance before `from`. */
export async function accountLedger(branchIds: string[], accountId: string, from: Date, to: Date, client: Client = db) {
  const account = await client.account.findUnique({ where: { id: accountId } });
  if (!account) return null;
  const sign = isDebitNormal(account.type) ? 1 : -1;
  const [before, lines] = await Promise.all([
    client.journalLine.aggregate({
      where: { accountId, branchId: { in: branchIds }, entry: { date: { lt: from } } },
      _sum: { debit: true, credit: true },
    }),
    client.journalLine.findMany({
      where: { accountId, branchId: { in: branchIds }, entry: { date: { gte: from, lt: endOfDay(to) } } },
      include: { entry: true, branch: { select: { code: true } }, customer: { select: { name: true } }, product: { select: { sku: true } } },
      orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
    }),
  ]);
  const opening = sign * Number((before._sum.debit ?? ZERO).minus(before._sum.credit ?? ZERO).toFixed(2));
  let running = opening;
  const rows = lines.map((l) => {
    const debit = n(l.debit);
    const credit = n(l.credit);
    running = round(running + sign * (debit - credit));
    return { line: l, debit, credit, balance: running };
  });
  return {
    account,
    opening,
    rows,
    closing: running,
    totalDebit: round(rows.reduce((s, r) => s + r.debit, 0)),
    totalCredit: round(rows.reduce((s, r) => s + r.credit, 0)),
  };
}

export const round = (v: number) => Math.round(v * 100) / 100;
export const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

/** Where a journal entry came from, as a link for the audit trail. */
export function sourceHref(e: { id: string; sourceType: string; sourceId: string | null; sourceNumber: string }) {
  const q = encodeURIComponent(e.sourceNumber);
  switch (e.sourceType) {
    case "SalesInvoice":
    case "SalesInvoiceVoid":
      return `/sales/invoices/${e.sourceId}`;
    case "Payment":
      return `/sales/payments?q=${q}`;
    case "CashEntry":
      return `/finance/cash?q=${q}`;
    case "GoodsReceipt":
      return `/purchasing/receipts/${e.sourceId}`;
    case "SupplierBill":
    case "SupplierBillVoid":
      return `/purchasing/bills/${e.sourceId}`;
    case "SupplierPayment":
      return `/purchasing/payments/${e.sourceId}`;
    case "StockMovement":
      return `/inventory/movements?q=${q}`;
    case "CostChange":
      return e.sourceNumber.startsWith("INV-") ? `/sales/invoices?q=${q}` : `/inventory/products?q=${q}`;
    default:
      return `/accounting/journals/${e.id}`;
  }
}

export const SOURCE_LABELS: Record<string, string> = {
  SalesInvoice: "Sales invoice",
  SalesInvoiceVoid: "Invoice void",
  Payment: "Payment received",
  CashEntry: "Cash book",
  GoodsReceipt: "Goods received",
  SupplierBill: "Supplier bill",
  SupplierBillVoid: "Bill void",
  SupplierPayment: "Payment made",
  StockMovement: "Stock movement",
  CostChange: "Cost revaluation",
  Manual: "Manual journal",
  Reversal: "Reversal",
  Opening: "Opening balances",
};
