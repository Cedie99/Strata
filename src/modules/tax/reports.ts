import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/core/db";
import { formatDate } from "@/core/format";
import { dateCell, dayBound, type GridCell, type GridColumn, type GridRow } from "@/core/grid";
import { ATC_DESCRIPTIONS, quarterRange } from "@/core/tax";
import { netShare } from "@/core/tax-math";
import { isDebitNormal } from "@/modules/accounting/module";
import { endOfDay, SOURCE_LABELS } from "@/modules/accounting/reports";

// The BIR books of accounts, summary lists and return worksheets. Each is built from the posted documents
// and the journal for the branches in scope, and comes back as one or more tables (sections) that the
// report page shows and the export turns into a workbook. Books take a date range (f_from / f_to);
// lists and returns take a calendar quarter (f_q, e.g. 2026-Q4).

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const sum = <T>(rows: T[], get: (r: T) => Decimal) => rows.reduce((s, r) => s.plus(get(r)), ZERO);
const round2 = (d: Decimal) => Number(d.toFixed(2));
const fmt = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A money cell: blank when zero on screen, 0 in the export. */
export const amt = (d: Decimal | number): GridCell => {
  const v = typeof d === "number" ? Math.round(d * 100) / 100 : round2(d);
  return { text: v === 0 ? "" : fmt(v), value: v };
};
const text = (s: string | null | undefined): GridCell => s || "-";

export type Section = { title?: string; description?: string; columns: GridColumn[]; rows: GridRow[]; totals?: Record<string, GridCell> };
export type Check = { label: string; ok: boolean; detail: string };
export type BirReport = { sections: Section[]; checks?: Check[]; notes?: string[] };
export type Params = Record<string, string>;

/** Totals of the given numeric columns over a section's rows. */
function totalsOf(rows: GridRow[], keys: string[], label: { key: string; text: string }) {
  const out: Record<string, GridCell> = { [label.key]: label.text };
  for (const k of keys) {
    const v = rows.reduce((s, r) => {
      const c = r.cells[k];
      return s + (typeof c === "object" && typeof c.value === "number" ? c.value : 0);
    }, 0);
    out[k] = amt(v);
  }
  return out;
}

const money = (key: string, label: string): GridColumn => ({ key, label, align: "right" });

/** Book dates: from the start of `from` through the end of `to`. */
export function bookRange(params: Params) {
  const now = new Date();
  const from = dayBound(params.f_from, false) ?? new Date(now.getFullYear(), 0, 1);
  const to = dayBound(params.f_to, false) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from, to, end: endOfDay(to) };
}

export const quarterOfParams = (params: Params) => quarterRange(params.f_q);

const monthIndex = (d: Date, months: Date[]) => months.findIndex((m) => m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth());
const monthLabel = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });

// ───────────────────────── Books of accounts ─────────────────────────

/** Every journal line in date order: the general journal. */
export async function generalJournal(branchIds: string[], params: Params): Promise<BirReport> {
  const { from, end } = bookRange(params);
  const entries = await db.journalEntry.findMany({
    where: { date: { gte: from, lt: end }, lines: { some: { branchId: { in: branchIds } } } },
    include: { lines: { where: { branchId: { in: branchIds } }, include: { account: true, branch: true } } },
    orderBy: [{ date: "asc" }, { number: "asc" }],
  });
  const rows: GridRow[] = entries.flatMap((e) =>
    e.lines.map((l) => ({
      id: l.id,
      href: `/accounting/journals/${e.id}`,
      cells: {
        date: dateCell(e.date, formatDate),
        number: e.number,
        source: `${SOURCE_LABELS[e.sourceType] ?? e.sourceType}${e.sourceNumber ? ` ${e.sourceNumber}` : ""}`,
        branch: l.branch.code,
        code: l.account.code,
        account: l.account.name,
        particulars: text(l.memo || e.memo),
        debit: amt(l.debit),
        credit: amt(l.credit),
      },
    })),
  );
  return {
    sections: [
      {
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "number", label: "Entry", mono: true },
          { key: "source", label: "Source document" },
          { key: "branch", label: "Branch" },
          { key: "code", label: "Code", mono: true },
          { key: "account", label: "Account" },
          { key: "particulars", label: "Particulars" },
          money("debit", "Debit"),
          money("credit", "Credit"),
        ],
        rows,
        totals: totalsOf(rows, ["debit", "credit"], { key: "particulars", text: "Total" }),
      },
    ],
  };
}

/** Every account with its balance forward, its lines in the period and a running balance. */
export async function generalLedger(branchIds: string[], params: Params): Promise<BirReport> {
  const { from, end } = bookRange(params);
  const [accounts, opening, lines] = await Promise.all([
    db.account.findMany({ orderBy: { code: "asc" } }),
    db.journalLine.groupBy({
      by: ["accountId"],
      where: { branchId: { in: branchIds }, entry: { date: { lt: from } } },
      _sum: { debit: true, credit: true },
    }),
    db.journalLine.findMany({
      where: { branchId: { in: branchIds }, entry: { date: { gte: from, lt: end } } },
      include: { entry: true },
      orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
    }),
  ]);
  const openingBy = new Map(opening.map((o) => [o.accountId, (o._sum.debit ?? ZERO).minus(o._sum.credit ?? ZERO)]));
  const linesBy = new Map<string, typeof lines>();
  for (const l of lines) linesBy.set(l.accountId, [...(linesBy.get(l.accountId) ?? []), l]);
  const bal = (d: Decimal): GridCell => {
    const v = round2(d);
    return { text: v === 0 ? "0.00" : `${fmt(Math.abs(v))} ${v > 0 ? "Dr" : "Cr"}`, value: v };
  };

  const rows: GridRow[] = [];
  for (const a of accounts) {
    const own = linesBy.get(a.id) ?? [];
    let running = openingBy.get(a.id) ?? ZERO;
    if (own.length === 0 && running.isZero()) continue;
    const name = `${a.code} · ${a.name}`;
    rows.push({ id: `${a.id}:open`, cells: { account: name, date: "", number: "", particulars: "Balance forward", debit: "", credit: "", balance: bal(running) } });
    for (const l of own) {
      running = running.plus(l.debit).minus(l.credit);
      rows.push({
        id: l.id,
        href: `/accounting/journals/${l.entryId}`,
        cells: {
          account: name,
          date: dateCell(l.entry.date, formatDate),
          number: l.entry.number,
          particulars: text(l.memo || l.entry.memo),
          debit: amt(l.debit),
          credit: amt(l.credit),
          balance: bal(running),
        },
      });
    }
    const side = isDebitNormal(a.type) ? "debit" : "credit";
    rows.push({
      id: `${a.id}:close`,
      cells: { account: name, date: "", number: "", particulars: `Ending balance (normally ${side})`, debit: "", credit: "", balance: bal(running) },
    });
  }
  return {
    sections: [
      {
        columns: [
          { key: "account", label: "Account" },
          { key: "date", label: "Date", kind: "date" },
          { key: "number", label: "Entry", mono: true },
          { key: "particulars", label: "Particulars" },
          money("debit", "Debit"),
          money("credit", "Credit"),
          money("balance", "Balance"),
        ],
        rows,
      },
    ],
  };
}

/** Entries that move cash, with cash and the usual contra accounts in their own columns. */
async function cashBook(branchIds: string[], params: Params, direction: "in" | "out"): Promise<BirReport> {
  const { from, end } = bookRange(params);
  const entries = await db.journalEntry.findMany({
    where: {
      date: { gte: from, lt: end },
      lines: { some: { branchId: { in: branchIds }, account: { systemKey: "CASH" }, ...(direction === "in" ? { debit: { gt: 0 } } : { credit: { gt: 0 } }) } },
    },
    include: { lines: { where: { branchId: { in: branchIds } }, include: { account: true, customer: true, supplier: true } } },
    orderBy: [{ date: "asc" }, { number: "asc" }],
  });
  const main = direction === "in" ? ["CASH", "CWT", "AR"] : ["CASH", "WT_PAYABLE", "AP"];
  const rows: GridRow[] = [];
  for (const e of entries) {
    const by = (key: string) => e.lines.filter((l) => l.account.systemKey === key);
    const net = (key: string) => sum(by(key), (l) => l.debit.minus(l.credit));
    const cash = net("CASH");
    if (direction === "in" ? !cash.greaterThan(0) : !cash.lessThan(0)) continue;
    const party = e.lines.find((l) => l.customer)?.customer?.name ?? e.lines.find((l) => l.supplier)?.supplier?.name ?? "";
    const others = e.lines
      .filter((l) => !main.includes(l.account.systemKey ?? ""))
      .map((l) => `${l.account.code} ${l.account.name} ${l.debit.greaterThan(0) ? `Dr ${fmt(round2(l.debit))}` : `Cr ${fmt(round2(l.credit))}`}`);
    const cells: Record<string, GridCell> = {
      date: dateCell(e.date, formatDate),
      number: e.number,
      source: `${SOURCE_LABELS[e.sourceType] ?? e.sourceType}${e.sourceNumber ? ` ${e.sourceNumber}` : ""}`,
      party: text(party),
      particulars: text(e.memo),
      others: text(others.join("; ")),
    };
    if (direction === "in") Object.assign(cells, { cash: amt(cash), cwt: amt(net("CWT")), ar: amt(net("AR").negated()) });
    else Object.assign(cells, { cash: amt(cash.negated()), wt: amt(net("WT_PAYABLE").negated()), ap: amt(net("AP")) });
    rows.push({ id: e.id, href: `/accounting/journals/${e.id}`, cells });
  }
  const lead: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Entry", mono: true },
    { key: "source", label: "Document" },
    { key: "party", label: direction === "in" ? "Received from" : "Paid to" },
    { key: "particulars", label: "Particulars" },
  ];
  const amounts =
    direction === "in"
      ? [money("cash", "Cash (Dr)"), money("cwt", "Creditable WT (Dr)"), money("ar", "Receivables (Cr)")]
      : [money("cash", "Cash (Cr)"), money("wt", "WT payable (Cr)"), money("ap", "Payables (Dr)")];
  return {
    sections: [
      {
        columns: [...lead, ...amounts, { key: "others", label: "Other accounts" }],
        rows,
        totals: totalsOf(rows, amounts.map((c) => c.key), { key: "particulars", text: "Total" }),
      },
    ],
  };
}
export const cashReceiptsBook = (ids: string[], p: Params) => cashBook(ids, p, "in");
export const cashDisbursementsBook = (ids: string[], p: Params) => cashBook(ids, p, "out");

const byVat = <T extends { vatCode: string; amount: Decimal }>(lines: T[], code: string) => sum(lines.filter((l) => l.vatCode === code), (l) => l.amount);

/** Every sales invoice in the period, void ones included (marked VOID, with no amounts). */
export async function salesBook(branchIds: string[], params: Params): Promise<BirReport> {
  const { from, end } = bookRange(params);
  const invoices = await db.salesInvoice.findMany({
    where: { branchId: { in: branchIds }, date: { gte: from, lt: end } },
    include: { customer: true, branch: true, lines: { select: { vatCode: true, amount: true } } },
    orderBy: [{ date: "asc" }, { number: "asc" }],
  });
  const rows: GridRow[] = invoices.map((i) => {
    const live = i.status !== "VOID";
    const z = (d: Decimal) => amt(live ? d : ZERO);
    return {
      id: i.id,
      href: `/sales/invoices/${i.id}`,
      cells: {
        date: dateCell(i.date, formatDate),
        number: i.number,
        reference: text(i.reference),
        customer: i.customer.name,
        tin: text(i.customer.tin),
        address: text(i.customer.address),
        exempt: z(byVat(i.lines, "EXEMPT")),
        zero: z(byVat(i.lines, "ZERO")),
        vatable: z(byVat(i.lines, "VAT")),
        vat: z(i.vat),
        total: z(i.total),
        status: live ? "Posted" : { text: "VOID", tone: "muted" },
      },
    };
  });
  const amounts = ["exempt", "zero", "vatable", "vat", "total"];
  return {
    sections: [
      {
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "number", label: "Invoice", mono: true },
          { key: "reference", label: "Reference" },
          { key: "customer", label: "Customer" },
          { key: "tin", label: "TIN", mono: true },
          { key: "address", label: "Address" },
          money("exempt", "Exempt"),
          money("zero", "Zero-rated"),
          money("vatable", "VATable sales"),
          money("vat", "Output VAT"),
          money("total", "Total"),
          { key: "status", label: "Status", kind: "status" },
        ],
        rows,
        totals: totalsOf(rows, amounts, { key: "address", text: "Total" }),
      },
    ],
  };
}

/** Goods are lines for received stock; services (and other expenses) are lines charged to an account. */
type BillLine = { vatCode: string; amount: Decimal; vat: Decimal; accountId: string | null };
const goods = (lines: BillLine[]) => sum(lines.filter((l) => l.vatCode === "VAT" && !l.accountId), (l) => l.amount);
const services = (lines: BillLine[]) => sum(lines.filter((l) => l.vatCode === "VAT" && l.accountId), (l) => l.amount);

/** Every supplier bill in the period, void ones included. */
export async function purchasesBook(branchIds: string[], params: Params): Promise<BirReport> {
  const { from, end } = bookRange(params);
  const bills = await db.supplierBill.findMany({
    where: { branchId: { in: branchIds }, date: { gte: from, lt: end } },
    include: { supplier: true, lines: { select: { vatCode: true, amount: true, vat: true, accountId: true } } },
    orderBy: [{ date: "asc" }, { number: "asc" }],
  });
  const rows: GridRow[] = bills.map((b) => {
    const live = b.status !== "VOID";
    const z = (d: Decimal) => amt(live ? d : ZERO);
    return {
      id: b.id,
      href: `/purchasing/bills/${b.id}`,
      cells: {
        date: dateCell(b.date, formatDate),
        number: b.number,
        invoiceNo: b.supplierInvoiceNo,
        supplier: b.supplier.name,
        tin: text(b.supplier.tin),
        address: text(b.supplier.address),
        exempt: z(byVat(b.lines, "EXEMPT")),
        zero: z(byVat(b.lines, "ZERO")),
        goods: z(goods(b.lines)),
        services: z(services(b.lines)),
        vat: z(b.vat),
        total: z(b.total),
        status: live ? "Posted" : { text: "VOID", tone: "muted" },
      },
    };
  });
  return {
    sections: [
      {
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "number", label: "AP voucher", mono: true },
          { key: "invoiceNo", label: "Supplier invoice" },
          { key: "supplier", label: "Supplier" },
          { key: "tin", label: "TIN", mono: true },
          { key: "address", label: "Address" },
          money("exempt", "Exempt"),
          money("zero", "Zero-rated"),
          money("goods", "VATable goods"),
          money("services", "VATable services"),
          money("vat", "Input VAT"),
          money("total", "Total"),
          { key: "status", label: "Status", kind: "status" },
        ],
        rows,
        totals: totalsOf(rows, ["exempt", "zero", "goods", "services", "vat", "total"], { key: "address", text: "Total" }),
      },
    ],
    notes: ["VATable goods are billed receipts of stock; VATable services are bill lines charged to an expense account."],
  };
}

// ───────────────────────── Summary lists (quarterly) ─────────────────────────

export type SlsRow = { tin: string; name: string; address: string; exempt: Decimal; zero: Decimal; taxable: Decimal; vat: Decimal };
export type SlpRow = { tin: string; name: string; address: string; exempt: Decimal; zero: Decimal; services: Decimal; goods: Decimal; vat: Decimal };

/** Posted sales of the quarter per customer. */
export async function slsData(branchIds: string[], params: Params) {
  const q = quarterOfParams(params);
  const invoices = await db.salesInvoice.findMany({
    where: { branchId: { in: branchIds }, status: "POSTED", date: { gte: q.from, lt: q.to } },
    include: { customer: true, lines: { select: { vatCode: true, amount: true } } },
  });
  const by = new Map<string, SlsRow & { id: string }>();
  for (const i of invoices) {
    const r = by.get(i.customerId) ?? { id: i.customerId, tin: i.customer.tin, name: i.customer.name, address: i.customer.address, exempt: ZERO, zero: ZERO, taxable: ZERO, vat: ZERO };
    r.exempt = r.exempt.plus(byVat(i.lines, "EXEMPT"));
    r.zero = r.zero.plus(byVat(i.lines, "ZERO"));
    r.taxable = r.taxable.plus(byVat(i.lines, "VAT"));
    r.vat = r.vat.plus(i.vat);
    by.set(i.customerId, r);
  }
  return { q, rows: [...by.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function sls(branchIds: string[], params: Params): Promise<BirReport> {
  const { rows } = await slsData(branchIds, params);
  const grid: GridRow[] = rows.map((r) => ({
    id: r.id,
    href: `/sales/customers/${r.id}`,
    cells: {
      tin: r.tin ? r.tin : { text: "Missing", tone: "danger" },
      name: r.name,
      address: text(r.address),
      exempt: amt(r.exempt),
      zero: amt(r.zero),
      taxable: amt(r.taxable),
      vat: amt(r.vat),
      gross: amt(r.exempt.plus(r.zero).plus(r.taxable).plus(r.vat)),
    },
  }));
  const missing = rows.filter((r) => !r.tin).length;
  return {
    sections: [
      {
        columns: [
          { key: "tin", label: "TIN", mono: true },
          { key: "name", label: "Registered name" },
          { key: "address", label: "Address" },
          money("exempt", "Exempt"),
          money("zero", "Zero-rated"),
          money("taxable", "Taxable (net)"),
          money("vat", "Output VAT"),
          money("gross", "Gross sales"),
        ],
        rows: grid,
        totals: totalsOf(grid, ["exempt", "zero", "taxable", "vat", "gross"], { key: "address", text: "Total" }),
      },
    ],
    checks: [{ label: "Every customer has a TIN", ok: missing === 0, detail: missing ? `${missing} customer(s) without a TIN; add it on the customer page.` : "Yes" }],
  };
}

/** Posted purchases of the quarter per supplier. */
export async function slpData(branchIds: string[], params: Params) {
  const q = quarterOfParams(params);
  const bills = await db.supplierBill.findMany({
    where: { branchId: { in: branchIds }, status: "POSTED", date: { gte: q.from, lt: q.to } },
    include: { supplier: true, lines: { select: { vatCode: true, amount: true, vat: true, accountId: true } } },
  });
  const by = new Map<string, SlpRow & { id: string }>();
  for (const b of bills) {
    const r = by.get(b.supplierId) ?? { id: b.supplierId, tin: b.supplier.tin, name: b.supplier.name, address: b.supplier.address, exempt: ZERO, zero: ZERO, services: ZERO, goods: ZERO, vat: ZERO };
    r.exempt = r.exempt.plus(byVat(b.lines, "EXEMPT"));
    r.zero = r.zero.plus(byVat(b.lines, "ZERO"));
    r.goods = r.goods.plus(goods(b.lines));
    r.services = r.services.plus(services(b.lines));
    r.vat = r.vat.plus(b.vat);
    by.set(b.supplierId, r);
  }
  return { q, rows: [...by.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function slp(branchIds: string[], params: Params): Promise<BirReport> {
  const { rows } = await slpData(branchIds, params);
  const grid: GridRow[] = rows.map((r) => ({
    id: r.id,
    href: `/purchasing/suppliers/${r.id}`,
    cells: {
      tin: r.tin ? r.tin : { text: "Missing", tone: "danger" },
      name: r.name,
      address: text(r.address),
      exempt: amt(r.exempt),
      zero: amt(r.zero),
      services: amt(r.services),
      goods: amt(r.goods),
      vat: amt(r.vat),
      gross: amt(r.services.plus(r.goods).plus(r.vat)),
    },
  }));
  const missing = rows.filter((r) => !r.tin).length;
  return {
    sections: [
      {
        columns: [
          { key: "tin", label: "TIN", mono: true },
          { key: "name", label: "Registered name" },
          { key: "address", label: "Address" },
          money("exempt", "Exempt"),
          money("zero", "Zero-rated"),
          money("services", "Services"),
          money("goods", "Goods other than capital"),
          money("vat", "Input VAT"),
          money("gross", "Gross taxable"),
        ],
        rows: grid,
        totals: totalsOf(grid, ["exempt", "zero", "services", "goods", "vat", "gross"], { key: "address", text: "Total" }),
      },
    ],
    checks: [{ label: "Every supplier has a TIN", ok: missing === 0, detail: missing ? `${missing} supplier(s) without a TIN; add it on the supplier page.` : "Yes" }],
    notes: ["Capital goods are not told apart from other goods yet; enter them in the BIR form by hand if you bought any."],
  };
}

// ───────────────────────── Return worksheets (quarterly) ─────────────────────────

/** Net movement of a system account in [from, to) for the branches: debits − credits. */
async function accountMovement(branchIds: string[], key: string, from: Date, to: Date) {
  const { _sum } = await db.journalLine.aggregate({
    where: { branchId: { in: branchIds }, account: { systemKey: key }, entry: { date: { gte: from, lt: to } } },
    _sum: { debit: true, credit: true },
  });
  return (_sum.debit ?? ZERO).minus(_sum.credit ?? ZERO);
}

const matchCheck = (label: string, report: Decimal, ledger: Decimal): Check => {
  const ok = report.minus(ledger).abs().lessThan(0.01);
  return { label, ok, detail: ok ? `Matches the ledger (${fmt(round2(ledger))})` : `Worksheet ${fmt(round2(report))}, ledger ${fmt(round2(ledger))}: check manual journals to this account.` };
};

/** Quarterly VAT (BIR Form 2550Q): sales and purchases by month with output and input VAT. */
export async function vat2550q(branchIds: string[], params: Params): Promise<BirReport> {
  const q = quarterOfParams(params);
  const [invoices, bills, outputLedger, inputLedger] = await Promise.all([
    db.salesInvoice.findMany({
      where: { branchId: { in: branchIds }, status: "POSTED", date: { gte: q.from, lt: q.to } },
      include: { lines: { select: { vatCode: true, amount: true } } },
    }),
    db.supplierBill.findMany({
      where: { branchId: { in: branchIds }, status: "POSTED", date: { gte: q.from, lt: q.to } },
      include: { lines: { select: { vatCode: true, amount: true, vat: true, accountId: true } } },
    }),
    accountMovement(branchIds, "OUTPUT_VAT", q.from, q.to),
    accountMovement(branchIds, "INPUT_VAT", q.from, q.to),
  ]);
  const months = q.months;
  const perMonth = <T extends { date: Date }>(docs: T[], get: (d: T) => Decimal) => {
    const out = [ZERO, ZERO, ZERO];
    for (const d of docs) {
      const m = monthIndex(d.date, months);
      if (m >= 0) out[m] = out[m].plus(get(d));
    }
    return out;
  };
  const lines: { id: string; label: string; values: Decimal[]; strong?: boolean }[] = [];
  const add = (id: string, label: string, values: Decimal[], strong = false) => lines.push({ id, label, values, strong });
  const vatable = perMonth(invoices, (i) => byVat(i.lines, "VAT"));
  const zero = perMonth(invoices, (i) => byVat(i.lines, "ZERO"));
  const exempt = perMonth(invoices, (i) => byVat(i.lines, "EXEMPT"));
  const output = perMonth(invoices, (i) => i.vat);
  add("s1", "VATable sales", vatable);
  add("s2", "Zero-rated sales", zero);
  add("s3", "Exempt sales", exempt);
  add("s4", "Total sales", [0, 1, 2].map((m) => vatable[m].plus(zero[m]).plus(exempt[m])), true);
  add("s5", "Output VAT", output, true);
  const pGoods = perMonth(bills, (b) => goods(b.lines));
  const pServices = perMonth(bills, (b) => services(b.lines));
  const pOther = perMonth(bills, (b) => byVat(b.lines, "ZERO").plus(byVat(b.lines, "EXEMPT")));
  const input = perMonth(bills, (b) => b.vat);
  add("p1", "Domestic purchases of goods other than capital goods", pGoods);
  add("p2", "Domestic purchases of services", pServices);
  add("p3", "Zero-rated and exempt purchases", pOther);
  add("p4", "Input VAT on purchases", input, true);
  add("v1", "VAT payable (output − input)", [0, 1, 2].map((m) => output[m].minus(input[m])), true);

  const total = (vs: Decimal[]) => vs.reduce((s, v) => s.plus(v), ZERO);
  const rows: GridRow[] = lines.map((l) => ({
    id: l.id,
    cells: {
      item: l.strong ? { text: l.label, hint: "SUBTOTAL" } : l.label,
      m1: amt(l.values[0]),
      m2: amt(l.values[1]),
      m3: amt(l.values[2]),
      quarter: amt(total(l.values)),
    },
  }));
  return {
    sections: [
      {
        columns: [
          { key: "item", label: "Item" },
          money("m1", monthLabel(months[0])),
          money("m2", monthLabel(months[1])),
          money("m3", monthLabel(months[2])),
          money("quarter", q.key),
        ],
        rows,
      },
    ],
    checks: [
      matchCheck("Output VAT agrees with the ledger", total(output), outputLedger.negated()),
      matchCheck("Input VAT agrees with the ledger", total(input), inputLedger),
    ],
    notes: [
      "Enter these figures in BIR Form 2550Q. Carry-over input VAT from the previous quarter, VAT on importations and tax credits are not tracked by Strata; add them on the form.",
      "Creditable VAT withheld by government customers is not tracked yet.",
    ],
  };
}

type WithholdingLine = { partyId: string; tin: string; name: string; atc: string; rate: Decimal; base: Decimal; tax: Decimal; month: number };

/** Tax we withheld from suppliers in the quarter, one line per payment of a bill. */
export async function ewtLines(branchIds: string[], params: Params, supplierId?: string) {
  const q = quarterOfParams(params);
  const lines = await db.supplierPaymentLine.findMany({
    where: { ewt: { gt: 0 }, payment: { branchId: { in: branchIds }, date: { gte: q.from, lt: q.to }, ...(supplierId && { supplierId }) } },
    include: { payment: { include: { supplier: true } }, bill: true },
  });
  const rows: WithholdingLine[] = lines.map((l) => ({
    partyId: l.payment.supplierId,
    tin: l.payment.supplier.tin,
    name: l.payment.supplier.name,
    atc: l.bill.atc,
    rate: l.bill.ewtRate,
    base: netShare(l.amount, l.bill),
    tax: l.ewt,
    month: monthIndex(l.payment.date, q.months),
  }));
  return { q, rows };
}

/** Tax our customers withheld from us in the quarter, one line per payment received. */
async function cwtLines(branchIds: string[], params: Params) {
  const q = quarterOfParams(params);
  const payments = await db.payment.findMany({
    where: { cwt: { gt: 0 }, date: { gte: q.from, lt: q.to }, invoice: { branchId: { in: branchIds } } },
    include: { invoice: { include: { customer: true } } },
  });
  const rows: WithholdingLine[] = payments.map((p) => {
    const base = netShare(p.amount, p.invoice);
    return {
      partyId: p.invoice.customerId,
      tin: p.invoice.customer.tin,
      name: p.invoice.customer.name,
      atc: p.atc,
      rate: base.isZero() ? ZERO : p.cwt.div(base).times(100).toDecimalPlaces(2),
      base,
      tax: p.cwt,
      month: monthIndex(p.date, q.months),
    };
  });
  return { q, rows };
}

/** Lines grouped per party and ATC (the QAP / SAWT layout). */
function perPayee(lines: WithholdingLine[]) {
  const by = new Map<string, WithholdingLine & { months: Decimal[] }>();
  for (const l of lines) {
    const key = `${l.partyId}|${l.atc}`;
    const r = by.get(key) ?? { ...l, base: ZERO, tax: ZERO, months: [ZERO, ZERO, ZERO] };
    r.base = r.base.plus(l.base);
    r.tax = r.tax.plus(l.tax);
    if (l.month >= 0) r.months[l.month] = r.months[l.month].plus(l.tax);
    by.set(key, r);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name) || a.atc.localeCompare(b.atc));
}

const rateText = (r: Decimal) => `${r.toDecimalPlaces(2).toString()}%`;

/** Quarterly expanded withholding (1601-EQ) by ATC, and the quarterly alphalist of payees (QAP). */
export async function ewt1601eq(branchIds: string[], params: Params): Promise<BirReport> {
  const { q, rows: lines } = await ewtLines(branchIds, params);
  const atcs = new Map<string, { base: Decimal; months: Decimal[]; rate: Decimal }>();
  for (const l of lines) {
    const key = l.atc || "(no ATC)";
    const r = atcs.get(key) ?? { base: ZERO, months: [ZERO, ZERO, ZERO], rate: l.rate };
    r.base = r.base.plus(l.base);
    if (l.month >= 0) r.months[l.month] = r.months[l.month].plus(l.tax);
    atcs.set(key, r);
  }
  const summary: GridRow[] = [...atcs].map(([atc, r]) => ({
    id: atc,
    cells: {
      atc,
      nature: text(ATC_DESCRIPTIONS[atc]),
      base: amt(r.base),
      rate: rateText(r.rate),
      m1: amt(r.months[0]),
      m2: amt(r.months[1]),
      m3: amt(r.months[2]),
      total: amt(r.months.reduce((s, v) => s.plus(v), ZERO)),
    },
  }));
  const payees = perPayee(lines);
  const qap: GridRow[] = payees.map((p, i) => ({
    id: `${p.partyId}|${p.atc}`,
    href: `/purchasing/suppliers/${p.partyId}`,
    cells: {
      seq: String(i + 1),
      tin: p.tin ? p.tin : { text: "Missing", tone: "danger" },
      name: p.name,
      atc: text(p.atc),
      nature: text(ATC_DESCRIPTIONS[p.atc]),
      base: amt(p.base),
      rate: rateText(p.rate),
      tax: amt(p.tax),
    },
  }));
  const noAtc = lines.filter((l) => !l.atc).length;
  return {
    sections: [
      {
        title: "1601-EQ · tax withheld by ATC",
        description: `Months 1 and 2 are remitted monthly with Form 0619-E; the quarter is filed on 1601-EQ.`,
        columns: [
          { key: "atc", label: "ATC", mono: true },
          { key: "nature", label: "Nature of income payment" },
          money("base", "Tax base"),
          { key: "rate", label: "Rate", align: "right" },
          money("m1", monthLabel(q.months[0])),
          money("m2", monthLabel(q.months[1])),
          money("m3", monthLabel(q.months[2])),
          money("total", "Tax withheld"),
        ],
        rows: summary,
        totals: totalsOf(summary, ["base", "m1", "m2", "m3", "total"], { key: "nature", text: "Total" }),
      },
      {
        title: "QAP · quarterly alphalist of payees",
        columns: [
          { key: "seq", label: "#" },
          { key: "tin", label: "TIN", mono: true },
          { key: "name", label: "Payee" },
          { key: "atc", label: "ATC", mono: true },
          { key: "nature", label: "Nature of income payment" },
          money("base", "Income payment"),
          { key: "rate", label: "Rate", align: "right" },
          money("tax", "Tax withheld"),
        ],
        rows: qap,
        totals: totalsOf(qap, ["base", "tax"], { key: "nature", text: "Total" }),
      },
    ],
    checks: [
      { label: "Every payee has a TIN", ok: payees.every((p) => p.tin), detail: payees.every((p) => p.tin) ? "Yes" : "Add the missing TINs on the supplier pages." },
      { label: "Every withholding has an ATC", ok: noAtc === 0, detail: noAtc ? `${noAtc} payment line(s) from bills without an ATC.` : "Yes" },
    ],
    notes: ["Withholding is recorded when a bill is paid; the income payment is the paid share of the bill net of VAT."],
  };
}

/** Summary alphalist of withholding taxes: what customers withheld from us, backed by their Forms 2307. */
export async function sawt(branchIds: string[], params: Params): Promise<BirReport> {
  const q = quarterOfParams(params);
  const [{ rows: lines }, ledger] = await Promise.all([cwtLines(branchIds, params), accountMovement(branchIds, "CWT", q.from, q.to)]);
  const payors = perPayee(lines);
  const rows: GridRow[] = payors.map((p, i) => ({
    id: `${p.partyId}|${p.atc}`,
    href: `/sales/customers/${p.partyId}`,
    cells: {
      seq: String(i + 1),
      tin: p.tin ? p.tin : { text: "Missing", tone: "danger" },
      name: p.name,
      atc: text(p.atc),
      nature: text(ATC_DESCRIPTIONS[p.atc]),
      base: amt(p.base),
      rate: rateText(p.base.isZero() ? ZERO : p.tax.div(p.base).times(100)),
      tax: amt(p.tax),
    },
  }));
  const total = sum(lines, (l) => l.tax);
  return {
    sections: [
      {
        columns: [
          { key: "seq", label: "#" },
          { key: "tin", label: "TIN", mono: true },
          { key: "name", label: "Payor (customer)" },
          { key: "atc", label: "ATC", mono: true },
          { key: "nature", label: "Nature of income payment" },
          money("base", "Income payment"),
          { key: "rate", label: "Rate", align: "right" },
          money("tax", "Tax withheld"),
        ],
        rows,
        totals: totalsOf(rows, ["base", "tax"], { key: "nature", text: "Total" }),
      },
    ],
    checks: [
      matchCheck("Creditable withholding agrees with the ledger", total, ledger),
      { label: "Every payor has a TIN", ok: payors.every((p) => p.tin), detail: payors.every((p) => p.tin) ? "Yes" : "Add the missing TINs on the customer pages." },
    ],
    notes: ["Attach the SAWT to the income tax return (1702Q / 1702) or 2550Q. Keep each customer's Form 2307."],
  };
}

/** Suppliers we withheld from in the quarter: one Form 2307 each. */
export async function form2307List(branchIds: string[], params: Params): Promise<BirReport> {
  const { q, rows: lines } = await ewtLines(branchIds, params);
  const by = new Map<string, { name: string; tin: string; base: Decimal; tax: Decimal }>();
  for (const l of lines) {
    const r = by.get(l.partyId) ?? { name: l.name, tin: l.tin, base: ZERO, tax: ZERO };
    r.base = r.base.plus(l.base);
    r.tax = r.tax.plus(l.tax);
    by.set(l.partyId, r);
  }
  const rows: GridRow[] = [...by]
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, r]) => ({
      id,
      href: `/print/form-2307/${id}?f_q=${q.key}`,
      cells: { name: r.name, tin: r.tin ? r.tin : { text: "Missing", tone: "danger" }, base: amt(r.base), tax: amt(r.tax), action: "Print 2307 ›" },
    }));
  return {
    sections: [
      {
        columns: [
          { key: "name", label: "Supplier (payee)" },
          { key: "tin", label: "TIN", mono: true },
          money("base", "Income payments"),
          money("tax", "Tax withheld"),
          { key: "action", label: "" },
        ],
        rows,
        totals: totalsOf(rows, ["base", "tax"], { key: "tin", text: "Total" }),
      },
    ],
    notes: ["Give each supplier their Form 2307 within 20 days after the quarter ends. Click a row to print it."],
  };
}

