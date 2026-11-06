import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/core/db";
import { agingBucket, AGING_BUCKETS, daysOverdue, type AgingKey } from "@/modules/sales/queries";

// Everything on the business dashboard, computed from the ledgers: sales invoices (revenue, cost of
// goods sold), payments and the cash book (cash flow), open invoices (receivables) and stock movements
// (inventory). Sums are Decimal; the result is plain numbers for display. Voided invoices never count.

type Client = PrismaClient | Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const n = (d: Prisma.Decimal) => Number(d.toFixed(2));

export const PERIODS = [
  { key: "mtd", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "qtd", label: "This quarter" },
  { key: "ytd", label: "This year" },
  { key: "12m", label: "Last 12 months" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
export const isPeriod = (v: string | undefined): v is PeriodKey => PERIODS.some((p) => p.key === v);

/** Adds months, keeping the day but never spilling into the next month (31 Mar − 1 month = 28/29 Feb). */
function addMonths(d: Date, months: number) {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** [from, to) of a period and of the period it is compared with (the same stretch one period earlier). */
export function periodRange(key: PeriodKey, today = new Date()) {
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const ranges: Record<PeriodKey, { from: Date; to: Date; shift: number; prevLabel: string }> = {
    mtd: { from: monthStart, to: tomorrow, shift: 1, prevLabel: "same days last month" },
    "last-month": { from: addMonths(monthStart, -1), to: monthStart, shift: 1, prevLabel: "the month before" },
    qtd: {
      from: new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1),
      to: tomorrow,
      shift: 3,
      prevLabel: "same days last quarter",
    },
    ytd: { from: new Date(today.getFullYear(), 0, 1), to: tomorrow, shift: 12, prevLabel: "same days last year" },
    "12m": { from: addMonths(monthStart, -11), to: tomorrow, shift: 12, prevLabel: "the 12 months before" },
  };
  const r = ranges[key];
  return { from: r.from, to: r.to, prevFrom: addMonths(r.from, -r.shift), prevTo: addMonths(r.to, -r.shift), prevLabel: r.prevLabel };
}

const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;
const sum = <T>(rows: T[], get: (r: T) => Prisma.Decimal) => rows.reduce((s, r) => s.plus(get(r)), ZERO);
const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(branchIds: string[], periodKey: PeriodKey, client: Client = db, today = new Date()) {
  const period = periodRange(periodKey, today);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  // The trend charts always show the last 12 calendar months, this one included.
  const trendStart = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const since = new Date(Math.min(period.prevFrom.getTime(), trendStart.getTime()));
  const branch = { in: branchIds };

  const [invoices, periodLines, open, payments, paidAllTime, cash, cashAllTime, levels, products, branches, supplierPaid, supplierPaidAllTime] = await Promise.all([
    client.salesInvoice.findMany({
      where: { status: "POSTED", branchId: branch, date: { gte: since, lt: tomorrow } },
      select: { date: true, subtotal: true, costTotal: true, customerId: true, branchId: true, customer: { select: { name: true } } },
    }),
    client.salesInvoiceLine.findMany({
      where: { invoice: { status: "POSTED", branchId: branch, date: { gte: period.from, lt: period.to } } },
      select: { productId: true, qty: true, amount: true, unitCost: true },
    }),
    client.salesInvoice.findMany({
      where: { status: "POSTED", branchId: branch },
      select: { id: true, total: true, dueDate: true, customerId: true, customer: { select: { name: true } }, payments: { select: { amount: true } } },
    }),
    client.payment.findMany({
      where: { invoice: { branchId: branch }, date: { gte: since, lt: tomorrow } },
      select: { date: true, amount: true, cwt: true },
    }),
    client.payment.aggregate({ where: { invoice: { branchId: branch }, date: { lt: tomorrow } }, _sum: { amount: true, cwt: true } }),
    client.cashEntry.findMany({
      where: { branchId: branch, date: { gte: since, lt: tomorrow } },
      select: { date: true, amount: true, direction: true, category: true },
    }),
    client.cashEntry.groupBy({ by: ["direction"], where: { branchId: branch, date: { lt: tomorrow } }, _sum: { amount: true } }),
    client.stockMovement.groupBy({ by: ["productId"], where: { warehouse: { branchId: branch } }, _sum: { qty: true } }),
    client.product.findMany({ select: { id: true, sku: true, name: true, unit: true, cost: true, reorderLevel: true, isActive: true } }),
    client.branch.findMany({ where: { id: branch }, select: { id: true, code: true } }),
    // Payments to suppliers are cash out (what left the bank, net of withholding).
    client.supplierPayment.findMany({ where: { branchId: branch, date: { gte: since, lt: tomorrow } }, select: { date: true, net: true } }),
    client.supplierPayment.aggregate({ where: { branchId: branch, date: { lt: tomorrow } }, _sum: { net: true } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));

  // ── Revenue and gross profit ──
  const cur = invoices.filter((i) => inRange(i.date, period.from, period.to));
  const prev = invoices.filter((i) => inRange(i.date, period.prevFrom, period.prevTo));
  const revenue = n(sum(cur, (i) => i.subtotal));
  const prevRevenue = n(sum(prev, (i) => i.subtotal));
  const grossProfit = n(sum(cur, (i) => i.subtotal.minus(i.costTotal)));
  const prevGrossProfit = n(sum(prev, (i) => i.subtotal.minus(i.costTotal)));

  // ── Cash ──
  const cashIn = (from: Date, to: Date) =>
    sum(payments.filter((p) => inRange(p.date, from, to)), (p) => p.amount.minus(p.cwt)).plus(
      sum(cash.filter((c) => c.direction === "IN" && inRange(c.date, from, to)), (c) => c.amount),
    );
  const cashOut = (from: Date, to: Date) =>
    sum(cash.filter((c) => c.direction === "OUT" && inRange(c.date, from, to)), (c) => c.amount).plus(
      sum(supplierPaid.filter((p) => inRange(p.date, from, to)), (p) => p.net),
    );
  const allTime = (dir: string) => cashAllTime.find((c) => c.direction === dir)?._sum.amount ?? ZERO;
  const outByCategory = new Map<string, Prisma.Decimal>();
  for (const c of cash.filter((c) => c.direction === "OUT" && inRange(c.date, period.from, period.to)))
    outByCategory.set(c.category, (outByCategory.get(c.category) ?? ZERO).plus(c.amount));
  const toSuppliers = sum(supplierPaid.filter((p) => inRange(p.date, period.from, period.to)), (p) => p.net);
  if (toSuppliers.greaterThan(0)) outByCategory.set("Payment to supplier", (outByCategory.get("Payment to supplier") ?? ZERO).plus(toSuppliers));

  // ── Months for the trend charts ──
  const months = Array.from({ length: 12 }, (_, k) => {
    const from = new Date(trendStart.getFullYear(), trendStart.getMonth() + k, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const inv = invoices.filter((i) => inRange(i.date, from, to));
    const rev = n(sum(inv, (i) => i.subtotal));
    const gp = n(sum(inv, (i) => i.subtotal.minus(i.costTotal)));
    const cin = n(cashIn(from, to));
    const cout = n(cashOut(from, to));
    return {
      key: monthKey(from),
      label: from.toLocaleDateString("en-PH", { month: "short" }),
      year: from.getFullYear(),
      revenue: rev,
      grossProfit: gp,
      margin: ratio(gp, rev),
      cashIn: cin,
      cashOut: cout,
      net: Math.round((cin - cout) * 100) / 100,
    };
  });

  // ── Receivables ──
  const owed = open
    .map((i) => ({ ...i, outstanding: i.total.minus(sum(i.payments, (p) => p.amount)), days: daysOverdue(i.dueDate, today) }))
    .filter((i) => i.outstanding.greaterThan(0));
  const aging = AGING_BUCKETS.map((b) => {
    const rows = owed.filter((i) => agingBucket(i.days) === b.key);
    return { key: b.key as AgingKey, label: b.label, amount: n(sum(rows, (i) => i.outstanding)), count: rows.length };
  });
  const byCustomer = new Map<string, { id: string; name: string; amount: Prisma.Decimal; overdue: Prisma.Decimal; oldest: number }>();
  for (const i of owed) {
    const c = byCustomer.get(i.customerId) ?? { id: i.customerId, name: i.customer.name, amount: ZERO, overdue: ZERO, oldest: 0 };
    c.amount = c.amount.plus(i.outstanding);
    if (i.days > 0) c.overdue = c.overdue.plus(i.outstanding);
    c.oldest = Math.max(c.oldest, i.days);
    byCustomer.set(i.customerId, c);
  }
  const receivablesTotal = n(sum(owed, (i) => i.outstanding));
  const overdue = n(sum(owed.filter((i) => i.days > 0), (i) => i.outstanding));
  // Days sales outstanding: what is owed, in days of the last 90 days' average sales.
  const last90 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89);
  const recent = invoices.filter((i) => inRange(i.date, last90, tomorrow));
  const dailySales = n(sum(recent, (i) => i.subtotal)) / 90;
  const dailyCogs = n(sum(recent, (i) => i.costTotal)) / 90;

  // ── Inventory ──
  let inventoryValue = ZERO;
  let low = 0;
  let out = 0;
  const onHand = new Map(levels.map((l) => [l.productId, l._sum.qty ?? ZERO]));
  for (const p of products.filter((p) => p.isActive)) {
    const qty = onHand.get(p.id) ?? ZERO;
    inventoryValue = inventoryValue.plus(qty.times(p.cost));
    if (qty.lte(0)) out++;
    else if (qty.lte(p.reorderLevel)) low++;
  }

  // ── Sales performance ──
  const byProduct = new Map<string, { qty: Prisma.Decimal; revenue: Prisma.Decimal; cost: Prisma.Decimal }>();
  for (const l of periodLines) {
    const r = byProduct.get(l.productId) ?? { qty: ZERO, revenue: ZERO, cost: ZERO };
    byProduct.set(l.productId, { qty: r.qty.plus(l.qty), revenue: r.revenue.plus(l.amount), cost: r.cost.plus(l.qty.times(l.unitCost)) });
  }
  const topProducts = [...byProduct]
    .map(([id, r]) => {
      const p = productById.get(id);
      const rev = n(r.revenue);
      const gp = n(r.revenue.minus(r.cost));
      return { id, sku: p?.sku ?? "?", name: p?.name ?? "?", unit: p?.unit ?? "", qty: Number(r.qty.toString()), revenue: rev, grossProfit: gp, margin: ratio(gp, rev) };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const customerSales = new Map<string, { id: string; name: string; revenue: Prisma.Decimal; gp: Prisma.Decimal; count: number }>();
  for (const i of cur) {
    const c = customerSales.get(i.customerId) ?? { id: i.customerId, name: i.customer.name, revenue: ZERO, gp: ZERO, count: 0 };
    c.revenue = c.revenue.plus(i.subtotal);
    c.gp = c.gp.plus(i.subtotal.minus(i.costTotal));
    c.count++;
    customerSales.set(i.customerId, c);
  }
  const byBranch = branches
    .map((b) => {
      const rows = cur.filter((i) => i.branchId === b.id);
      const rev = n(sum(rows, (i) => i.subtotal));
      const gp = n(sum(rows, (i) => i.subtotal.minus(i.costTotal)));
      return { code: b.code, revenue: rev, grossProfit: gp, margin: ratio(gp, rev) };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    period: { key: periodKey, ...period },
    revenue: { value: revenue, prev: prevRevenue },
    grossProfit: { value: grossProfit, prev: prevGrossProfit },
    margin: { value: ratio(grossProfit, revenue), prev: ratio(prevGrossProfit, prevRevenue) },
    invoiceCount: cur.length,
    receivables: {
      total: receivablesTotal,
      overdue,
      aging,
      dso: dailySales > 0 ? Math.round(receivablesTotal / dailySales) : null,
      topDebtors: [...byCustomer.values()]
        .sort((a, b) => b.amount.comparedTo(a.amount))
        .slice(0, 6)
        .map((c) => ({ id: c.id, name: c.name, amount: n(c.amount), overdue: n(c.overdue), oldest: c.oldest })),
    },
    inventory: {
      value: n(inventoryValue),
      low,
      out,
      daysOnHand: dailyCogs > 0 ? Math.round(n(inventoryValue) / dailyCogs) : null,
    },
    cash: {
      balance: n(new Prisma.Decimal(paidAllTime._sum.amount ?? ZERO).minus(paidAllTime._sum.cwt ?? ZERO).plus(allTime("IN")).minus(allTime("OUT")).minus(supplierPaidAllTime._sum.net ?? ZERO)),
      inflow: n(cashIn(period.from, period.to)),
      outflow: n(cashOut(period.from, period.to)),
      prevNet: n(cashIn(period.prevFrom, period.prevTo).minus(cashOut(period.prevFrom, period.prevTo))),
      collections: n(sum(payments.filter((p) => inRange(p.date, period.from, period.to)), (p) => p.amount.minus(p.cwt))),
      outByCategory: [...outByCategory].map(([category, amount]) => ({ category, amount: n(amount) })).sort((a, b) => b.amount - a.amount),
    },
    months,
    topProducts: topProducts.slice(0, 8),
    topCustomers: [...customerSales.values()]
      .sort((a, b) => b.revenue.comparedTo(a.revenue))
      .slice(0, 8)
      .map((c) => ({ id: c.id, name: c.name, revenue: n(c.revenue), grossProfit: n(c.gp), margin: ratio(n(c.gp), n(c.revenue)), count: c.count })),
    byBranch,
  };
}
