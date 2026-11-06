import "server-only";
import { Prisma, type Branch } from "@prisma/client";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { dateCell, filterGrid, finishGrid, optionsOf, type FilterDef, type GridColumn, type GridList, type GridQuery } from "@/core/grid";
import { getSettings } from "@/core/settings";
import { PAYMENT_METHODS } from "@/modules/sales/module";
import { agingBucket, AGING_BUCKETS, daysOverdue } from "@/modules/sales/queries";
import { PO_STATUS_LABELS } from "./module";

// The purchasing list screens; same conventions as the sales lists (filter in memory, `all` skips paging
// for the Excel export). Callers check permissions.

type Opts = { all?: boolean };
const ZERO = new Prisma.Decimal(0);
const num = (d: Prisma.Decimal) => Number(d.toString());
const branchOptions = (branches: Branch[]) => branches.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }));
const cur = async () => (await getSettings())["company.currency"];
const money = (d: Prisma.Decimal, currency: string) => ({ text: formatMoney(d, currency), value: num(d) });

/** Posted bills with money still owed, with what is owed (applied payments include withholding). */
export async function openBills(branchIds: string[], supplierId?: string) {
  const bills = await db.supplierBill.findMany({
    where: { status: "POSTED", branchId: { in: branchIds }, ...(supplierId && { supplierId }) },
    include: { allocations: { select: { amount: true, ewt: true } }, supplier: true, branch: true },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
  });
  return bills
    .map((b) => ({
      ...b,
      paid: b.allocations.reduce((s, a) => s.plus(a.amount), ZERO),
      withheld: b.allocations.reduce((s, a) => s.plus(a.ewt), ZERO),
      outstanding: b.total.minus(b.allocations.reduce((s, a) => s.plus(a.amount), ZERO)),
    }))
    .filter((b) => b.outstanding.greaterThan(0));
}

export async function supplierList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [suppliers, open, currency] = await Promise.all([db.supplier.findMany({ orderBy: { name: "asc" } }), openBills(scope.ids), cur()]);
  const owed = new Map<string, Prisma.Decimal>();
  for (const b of open) owed.set(b.supplierId, (owed.get(b.supplierId) ?? ZERO).plus(b.outstanding));
  type S = (typeof suppliers)[number];
  const filters: FilterDef<S>[] = [
    { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }], get: (s) => (s.isActive ? "active" : "inactive") },
    { key: "vat", label: "VAT", type: "select", options: [{ value: "vat", label: "VAT-registered" }, { value: "non", label: "Non-VAT" }], get: (s) => (s.vatRegistered ? "vat" : "non") },
    { key: "balance", label: "Balance", type: "select", options: [{ value: "owing", label: "We owe money" }, { value: "clear", label: "Nothing owed" }], get: (s) => (owed.get(s.id)?.greaterThan(0) ? "owing" : "clear") },
  ];
  const matched = filterGrid(suppliers, query, { text: (s) => `${s.code} ${s.name} ${s.tin} ${s.email} ${s.phone}`, first: (s) => s.name, filters, all: true });
  const columns: GridColumn[] = [
    { key: "name", label: "Name" },
    { key: "code", label: "Code", mono: true },
    { key: "tin", label: "TIN", mono: true },
    { key: "phone", label: "Phone" },
    { key: "vat", label: "VAT" },
    { key: "ewt", label: "EWT %", align: "right" },
    { key: "terms", label: "Terms (days)", align: "right" },
    { key: "owed", label: scope.current ? `We owe (${scope.current.code})` : "We owe", align: "right" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const rows = matched.rows.map((s) => ({
    id: s.id,
    href: `/purchasing/suppliers/${s.id}`,
    cells: {
      name: s.name,
      code: s.code,
      tin: s.tin || "-",
      phone: s.phone || "-",
      vat: s.vatRegistered ? "VAT" : "Non-VAT",
      ewt: { text: s.ewtRate.isZero() ? "-" : `${s.ewtRate.toString()}%`, value: num(s.ewtRate) },
      terms: { text: String(s.termsDays), value: s.termsDays },
      owed: money(owed.get(s.id) ?? ZERO, currency),
      status: s.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

export async function orderList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [orders, currency] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { branchId: { in: scope.ids } },
      include: { supplier: true, branch: true, warehouse: true },
      orderBy: [{ date: "desc" }, { number: "desc" }],
    }),
    cur(),
  ]);
  type O = (typeof orders)[number];
  const filters: FilterDef<O>[] = [
    { key: "date", label: "PO date", type: "date", get: (o) => o.date },
    { key: "status", label: "Status", type: "select", options: Object.entries(PO_STATUS_LABELS).map(([value, label]) => ({ value, label })), get: (o) => o.status },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (o) => o.branchId },
    { key: "supplier", label: "Supplier", type: "select", options: optionsOf(orders, (o) => o.supplier.name), get: (o) => o.supplier.name },
  ];
  const matched = filterGrid(orders, query, { text: (o) => `${o.number} ${o.reference} ${o.supplier.code} ${o.supplier.name}`, first: (o) => o.supplier.name, filters, all: true });
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Number", mono: true },
    { key: "supplier", label: "Supplier" },
    { key: "warehouse", label: "Deliver to" },
    { key: "expected", label: "Expected", kind: "date" },
    { key: "total", label: "Total (incl. VAT)", align: "right" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const tone = (s: string) => (s === "CANCELLED" || s === "CLOSED" ? ("muted" as const) : s === "RECEIVED" ? ("ok" as const) : undefined);
  const rows = matched.rows.map((o) => ({
    id: o.id,
    href: `/purchasing/orders/${o.id}`,
    cells: {
      date: dateCell(o.date, formatDate),
      number: o.number,
      supplier: o.supplier.name,
      warehouse: `${o.branch.code} / ${o.warehouse.code}`,
      expected: o.expectedDate ? dateCell(o.expectedDate, formatDate) : "-",
      total: money(o.total, currency),
      status: tone(o.status) ? { text: PO_STATUS_LABELS[o.status], tone: tone(o.status) } : PO_STATUS_LABELS[o.status],
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

export async function receiptList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [receipts, currency] = await Promise.all([
    db.goodsReceipt.findMany({
      where: { branchId: { in: scope.ids } },
      include: { supplier: true, branch: true, warehouse: true, order: { select: { number: true } }, createdBy: { select: { name: true } }, lines: { select: { _count: { select: { billLines: { where: { bill: { status: "POSTED" } } } } } } } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
    }),
    cur(),
  ]);
  const withState = receipts.map((r) => {
    const billed = r.lines.filter((l) => l._count.billLines > 0).length;
    return { ...r, billing: billed === 0 ? "unbilled" : billed === r.lines.length ? "billed" : "partial" };
  });
  type R = (typeof withState)[number];
  const filters: FilterDef<R>[] = [
    { key: "date", label: "Date", type: "date", get: (r) => r.date },
    { key: "billing", label: "Billing", type: "select", options: [{ value: "unbilled", label: "Not billed" }, { value: "partial", label: "Partly billed" }, { value: "billed", label: "Billed" }], get: (r) => r.billing },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (r) => r.branchId },
  ];
  const matched = filterGrid(withState, query, { text: (r) => `${r.number} ${r.reference} ${r.order.number} ${r.supplier.name}`, first: (r) => r.supplier.name, filters, all: true });
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Number", mono: true },
    { key: "order", label: "PO", mono: true },
    { key: "supplier", label: "Supplier" },
    { key: "warehouse", label: "Warehouse" },
    { key: "reference", label: "Supplier DR" },
    { key: "total", label: "Value (net)", align: "right" },
    { key: "billing", label: "Billing", kind: "status" },
  ];
  const rows = matched.rows.map((r) => ({
    id: r.id,
    href: `/purchasing/receipts/${r.id}`,
    cells: {
      date: dateCell(r.date, formatDate),
      number: r.number,
      order: r.order.number,
      supplier: r.supplier.name,
      warehouse: `${r.branch.code} / ${r.warehouse.code}`,
      reference: r.reference || "-",
      total: money(r.total, currency),
      billing: r.billing === "billed" ? { text: "Billed", tone: "ok" as const } : r.billing === "partial" ? "Partly billed" : { text: "Not billed", tone: "danger" as const },
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

export async function billList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [bills, currency] = await Promise.all([
    db.supplierBill.findMany({
      where: { branchId: { in: scope.ids } },
      include: { supplier: true, branch: true, allocations: { select: { amount: true } } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
    }),
    cur(),
  ]);
  const today = new Date();
  const rowsFull = bills.map((b) => {
    const paid = b.allocations.reduce((s, a) => s.plus(a.amount), ZERO);
    const state = b.status === "VOID" ? "void" : paid.isZero() ? "unpaid" : paid.greaterThanOrEqualTo(b.total) ? "paid" : "partial";
    return { ...b, paid, state, overdue: (state === "unpaid" || state === "partial") && daysOverdue(b.dueDate, today) > 0 };
  });
  type B = (typeof rowsFull)[number];
  const filters: FilterDef<B>[] = [
    { key: "date", label: "Bill date", type: "date", get: (b) => b.date },
    { key: "state", label: "Payment", type: "select", options: [{ value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partly paid" }, { value: "paid", label: "Paid" }, { value: "void", label: "Void" }], get: (b) => b.state },
    { key: "overdue", label: "Overdue", type: "select", options: [{ value: "yes", label: "Past due date and not fully paid" }], get: (b) => (b.overdue ? "yes" : "") },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (b) => b.branchId },
    { key: "supplier", label: "Supplier", type: "select", options: optionsOf(rowsFull, (b) => b.supplier.name), get: (b) => b.supplier.name },
  ];
  const matched = filterGrid(rowsFull, query, { text: (b) => `${b.number} ${b.supplierInvoiceNo} ${b.supplier.code} ${b.supplier.name}`, first: (b) => b.supplier.name, filters, all: true });
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Number", mono: true },
    { key: "invoice", label: "Supplier invoice", mono: true },
    { key: "supplier", label: "Supplier" },
    { key: "branch", label: "Branch" },
    { key: "due", label: "Due", kind: "date" },
    { key: "net", label: "Net", align: "right" },
    { key: "vat", label: "VAT", align: "right" },
    { key: "total", label: "Total", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const status = (b: B) =>
    b.state === "void"
      ? { text: "Void", tone: "muted" as const }
      : b.state === "paid"
        ? { text: "Paid", tone: "ok" as const }
        : b.overdue
          ? { text: b.state === "partial" ? "Partly paid" : "Unpaid", tone: "danger" as const, hint: "OVERDUE" }
          : b.state === "partial"
            ? "Partly paid"
            : "Unpaid";
  const rows = matched.rows.map((b) => ({
    id: b.id,
    href: `/purchasing/bills/${b.id}`,
    cells: {
      date: dateCell(b.date, formatDate),
      number: b.number,
      invoice: b.supplierInvoiceNo,
      supplier: b.supplier.name,
      branch: b.branch.code,
      due: dateCell(b.dueDate, formatDate),
      net: money(b.subtotal, currency),
      vat: money(b.vat, currency),
      total: money(b.total, currency),
      balance: b.state === "void" ? "-" : money(b.total.minus(b.paid), currency),
      status: status(b),
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

export async function supplierPaymentList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [payments, currency] = await Promise.all([
    db.supplierPayment.findMany({
      where: { branchId: { in: scope.ids } },
      include: { supplier: true, branch: true, createdBy: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
    }),
    cur(),
  ]);
  const methodLabel = new Map<string, string>(PAYMENT_METHODS.map((m) => [m.value, m.label]));
  type Pay = (typeof payments)[number];
  const filters: FilterDef<Pay>[] = [
    { key: "date", label: "Date", type: "date", get: (p) => p.date },
    { key: "method", label: "Method", type: "select", options: [...PAYMENT_METHODS], get: (p) => p.method },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (p) => p.branchId },
  ];
  const matched = filterGrid(payments, query, { text: (p) => `${p.number} ${p.reference} ${p.supplier.code} ${p.supplier.name}`, first: (p) => p.supplier.name, filters, all: true });
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Number", mono: true },
    { key: "supplier", label: "Supplier" },
    { key: "branch", label: "Branch" },
    { key: "method", label: "Method" },
    { key: "reference", label: "Check / ref." },
    { key: "gross", label: "Bills settled", align: "right" },
    { key: "ewt", label: "EWT withheld", align: "right" },
    { key: "net", label: "Cash paid", align: "right" },
    { key: "by", label: "By" },
  ];
  const rows = matched.rows.map((p) => ({
    id: p.id,
    href: `/purchasing/payments/${p.id}`,
    cells: {
      date: dateCell(p.date, formatDate),
      number: p.number,
      supplier: p.supplier.name,
      branch: p.branch.code,
      method: methodLabel.get(p.method) ?? p.method,
      reference: p.reference || "-",
      gross: money(p.gross, currency),
      ewt: money(p.ewt, currency),
      net: money(p.net, currency),
      by: p.createdBy?.name ?? "-",
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

/** Open bills with their age, oldest due date first: what to pay next. */
export async function payablesList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [open, currency] = await Promise.all([openBills(scope.ids), cur()]);
  const today = new Date();
  type O = (typeof open)[number];
  const filters: FilterDef<O>[] = [
    { key: "age", label: "Age", type: "select", options: AGING_BUCKETS.map((b) => ({ value: b.key, label: b.label })), get: (b) => agingBucket(daysOverdue(b.dueDate, today)) },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (b) => b.branchId },
    { key: "supplier", label: "Supplier", type: "select", options: optionsOf(open, (b) => b.supplier.name), get: (b) => b.supplier.name },
  ];
  const matched = filterGrid(open, query, { text: (b) => `${b.number} ${b.supplierInvoiceNo} ${b.supplier.code} ${b.supplier.name}`, first: (b) => b.supplier.name, filters, all: true });
  const columns: GridColumn[] = [
    { key: "supplier", label: "Supplier" },
    { key: "number", label: "Bill", mono: true },
    { key: "invoice", label: "Supplier invoice", mono: true },
    { key: "branch", label: "Branch" },
    { key: "due", label: "Due", kind: "date" },
    { key: "days", label: "Days overdue", align: "right" },
    { key: "total", label: "Total", align: "right" },
    { key: "outstanding", label: "Outstanding", align: "right" },
  ];
  const rows = matched.rows.map((b) => {
    const days = daysOverdue(b.dueDate, today);
    return {
      id: b.id,
      href: `/purchasing/bills/${b.id}`,
      cells: {
        supplier: b.supplier.name,
        number: b.number,
        invoice: b.supplierInvoiceNo,
        branch: b.branch.code,
        due: dateCell(b.dueDate, formatDate),
        days: { text: days > 0 ? String(days) : "Not due", value: Math.max(0, days), tone: days > 30 ? ("danger" as const) : undefined },
        total: money(b.total, currency),
        outstanding: money(b.outstanding, currency),
      },
    };
  });
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}
