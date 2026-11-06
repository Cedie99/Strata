import "server-only";
import { Prisma, type Branch } from "@prisma/client";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import {
  dateCell,
  filterGrid,
  finishGrid,
  optionsOf,
  type FilterDef,
  type GridColumn,
  type GridList,
  type GridQuery,
} from "@/core/grid";
import { getSettings } from "@/core/settings";
import { PAYMENT_METHODS } from "./module";
import { agingBucket, AGING_BUCKETS, daysOverdue } from "./queries";

// The sales list screens. Like the inventory lists they filter in memory and, with `all`, skip paging
// so the Excel export reuses exactly what the user sees. Callers check permissions.

type Opts = { all?: boolean };
const num = (d: Prisma.Decimal) => Number(d.toString());
const ZERO = new Prisma.Decimal(0);
const branchOptions = (branches: Branch[]) => branches.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }));
const money = (d: Prisma.Decimal, currency: string) => ({ text: formatMoney(d, currency), value: num(d) });

export async function customerList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [customers, open, settings] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" } }),
    openInvoices(scope.ids),
    getSettings(),
  ]);
  const currency = settings["company.currency"];
  const owed = new Map<string, Prisma.Decimal>();
  for (const i of open) owed.set(i.customerId, (owed.get(i.customerId) ?? ZERO).plus(i.outstanding));
  type C = (typeof customers)[number];

  const filters: FilterDef<C>[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
      get: (c) => (c.isActive ? "active" : "inactive"),
    },
    {
      key: "balance",
      label: "Balance",
      type: "select",
      options: [
        { value: "owing", label: "Owes money" },
        { value: "clear", label: "Nothing owed" },
      ],
      get: (c) => (owed.get(c.id)?.greaterThan(0) ? "owing" : "clear"),
    },
  ];
  const matched = filterGrid(customers, query, {
    text: (c) => `${c.code} ${c.name} ${c.email} ${c.phone}`,
    first: (c) => c.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "name", label: "Name" },
    { key: "code", label: "Code", mono: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "terms", label: "Terms (days)", align: "right" },
    { key: "owed", label: scope.current ? `Owed (${scope.current.code})` : "Owed", align: "right" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const rows = matched.rows.map((c) => ({
    id: c.id,
    href: `/sales/customers/${c.id}`,
    cells: {
      name: c.name,
      code: c.code,
      phone: c.phone || "-",
      email: c.email || "-",
      terms: { text: String(c.termsDays), value: c.termsDays },
      owed: money(owed.get(c.id) ?? ZERO, currency),
      status: c.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

/** Posted invoices that still have money owed, with what is owed. */
export async function openInvoices(branchIds: string[]) {
  const invoices = await db.salesInvoice.findMany({
    where: { status: "POSTED", branchId: { in: branchIds } },
    include: { payments: { select: { amount: true } }, customer: true, branch: true },
    orderBy: { dueDate: "asc" },
  });
  return invoices
    .map((i) => ({ ...i, outstanding: i.total.minus(i.payments.reduce((s, p) => s.plus(p.amount), ZERO)) }))
    .filter((i) => i.outstanding.greaterThan(0));
}

const paidState = (total: Prisma.Decimal, paid: Prisma.Decimal) =>
  paid.isZero() ? "unpaid" : paid.greaterThanOrEqualTo(total) ? "paid" : "partial";

export async function invoiceList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [invoices, settings] = await Promise.all([
    db.salesInvoice.findMany({
      where: { branchId: { in: scope.ids } },
      include: { customer: true, branch: true, payments: { select: { amount: true } } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
    }),
    getSettings(),
  ]);
  const currency = settings["company.currency"];
  const today = new Date();
  const rowsFull = invoices.map((i) => {
    const paid = i.payments.reduce((s, p) => s.plus(p.amount), ZERO);
    const state = i.status === "VOID" ? "void" : paidState(i.total, paid);
    return { ...i, paid, state, overdue: state !== "paid" && state !== "void" && daysOverdue(i.dueDate, today) > 0 };
  });
  type I = (typeof rowsFull)[number];
  const filters: FilterDef<I>[] = [
    { key: "date", label: "Invoice date", type: "date", get: (i) => i.date },
    {
      key: "state",
      label: "Payment",
      type: "select",
      options: [
        { value: "unpaid", label: "Unpaid" },
        { value: "partial", label: "Partly paid" },
        { value: "paid", label: "Paid" },
        { value: "void", label: "Void" },
      ],
      get: (i) => i.state,
    },
    {
      key: "overdue",
      label: "Overdue",
      type: "select",
      options: [{ value: "yes", label: "Past due date and not fully paid" }],
      get: (i) => (i.overdue ? "yes" : ""),
    },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (i) => i.branchId },
    { key: "customer", label: "Customer", type: "select", options: optionsOf(rowsFull, (i) => i.customer.name), get: (i) => i.customer.name },
  ];
  const matched = filterGrid(rowsFull, query, {
    text: (i) => `${i.number} ${i.reference} ${i.customer.code} ${i.customer.name}`,
    first: (i) => i.customer.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Number", mono: true },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "due", label: "Due", kind: "date" },
    { key: "net", label: "Net of VAT", align: "right" },
    { key: "vat", label: "VAT", align: "right" },
    { key: "total", label: "Total", align: "right" },
    { key: "margin", label: "Gross margin", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const statusCell = (i: I) =>
    i.state === "void"
      ? { text: "Void", tone: "muted" as const }
      : i.state === "paid"
        ? "Paid"
        : i.overdue
          ? { text: i.state === "partial" ? "Partly paid" : "Unpaid", tone: "danger" as const, hint: "OVERDUE" }
          : i.state === "partial"
            ? "Partly paid"
            : "Unpaid";
  const rows = matched.rows.map((i) => {
    const margin = i.subtotal.isZero() ? 0 : num(i.subtotal.minus(i.costTotal)) / num(i.subtotal);
    return {
      id: i.id,
      href: `/sales/invoices/${i.id}`,
      cells: {
        date: dateCell(i.date, formatDate),
        number: i.number,
        customer: i.customer.name,
        branch: i.branch.code,
        due: dateCell(i.dueDate, formatDate),
        net: money(i.subtotal, currency),
        vat: money(i.vat, currency),
        total: money(i.total, currency),
        margin: { text: `${(margin * 100).toFixed(1)}%`, value: Math.round(margin * 1000) / 10, tone: margin < 0 ? ("danger" as const) : undefined },
        balance: i.state === "void" ? "-" : money(i.total.minus(i.paid), currency),
        status: statusCell(i),
      },
    };
  });
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

export async function paymentList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [payments, settings] = await Promise.all([
    db.payment.findMany({
      where: { invoice: { branchId: { in: scope.ids } } },
      include: { invoice: { include: { customer: true, branch: true } }, createdBy: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
    }),
    getSettings(),
  ]);
  const currency = settings["company.currency"];
  type Pay = (typeof payments)[number];
  const methodLabel = new Map<string, string>(PAYMENT_METHODS.map((m) => [m.value, m.label]));
  const filters: FilterDef<Pay>[] = [
    { key: "date", label: "Date", type: "date", get: (p) => p.date },
    { key: "method", label: "Method", type: "select", options: [...PAYMENT_METHODS], get: (p) => p.method },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (p) => p.invoice.branchId },
  ];
  const matched = filterGrid(payments, query, {
    text: (p) => `${p.number} ${p.reference} ${p.invoice.number} ${p.invoice.customer.name}`,
    first: (p) => p.invoice.customer.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Number", mono: true },
    { key: "customer", label: "Customer" },
    { key: "invoice", label: "Invoice", mono: true },
    { key: "branch", label: "Branch" },
    { key: "method", label: "Method" },
    { key: "reference", label: "Reference" },
    { key: "amount", label: "Amount applied", align: "right" },
    { key: "cwt", label: "Tax withheld", align: "right" },
    { key: "cash", label: "Cash received", align: "right" },
    { key: "by", label: "By" },
  ];
  const rows = matched.rows.map((p) => ({
    id: p.id,
    href: `/sales/invoices/${p.invoiceId}`,
    cells: {
      date: dateCell(p.date, formatDate),
      number: p.number,
      customer: p.invoice.customer.name,
      invoice: p.invoice.number,
      branch: p.invoice.branch.code,
      method: methodLabel.get(p.method) ?? p.method,
      reference: p.reference || "-",
      amount: money(p.amount, currency),
      cwt: p.cwt.isZero() ? "-" : money(p.cwt, currency),
      cash: money(p.amount.minus(p.cwt), currency),
      by: p.createdBy?.name ?? "-",
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

/** Open invoices with their age, for chasing money. */
export async function receivablesList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [open, settings] = await Promise.all([openInvoices(scope.ids), getSettings()]);
  const currency = settings["company.currency"];
  const today = new Date();
  type O = (typeof open)[number];
  const filters: FilterDef<O>[] = [
    {
      key: "age",
      label: "Age",
      type: "select",
      options: AGING_BUCKETS.map((b) => ({ value: b.key, label: b.label })),
      get: (i) => agingBucket(daysOverdue(i.dueDate, today)),
    },
    { key: "branch", label: "Branch", type: "select", options: branchOptions(scope.allowed), get: (i) => i.branchId },
  ];
  const matched = filterGrid(open, query, {
    text: (i) => `${i.number} ${i.reference} ${i.customer.code} ${i.customer.name}`,
    first: (i) => i.customer.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "customer", label: "Customer" },
    { key: "number", label: "Invoice", mono: true },
    { key: "branch", label: "Branch" },
    { key: "date", label: "Invoice date", kind: "date" },
    { key: "due", label: "Due", kind: "date" },
    { key: "days", label: "Days overdue", align: "right" },
    { key: "total", label: "Total", align: "right" },
    { key: "outstanding", label: "Outstanding", align: "right" },
  ];
  const rows = matched.rows.map((i) => {
    const days = daysOverdue(i.dueDate, today);
    return {
      id: i.id,
      href: `/sales/invoices/${i.id}`,
      cells: {
        customer: i.customer.name,
        number: i.number,
        branch: i.branch.code,
        date: dateCell(i.date, formatDate),
        due: dateCell(i.dueDate, formatDate),
        days: { text: days > 0 ? String(days) : "Not due", value: Math.max(0, days), tone: days > 30 ? ("danger" as const) : undefined },
        total: money(i.total, currency),
        outstanding: money(i.outstanding, currency),
      },
    };
  });
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}
