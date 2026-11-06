import "server-only";
import { Prisma } from "@prisma/client";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { dateCell, dayBound, filterGrid, finishGrid, GRID_PAGE_SIZE, type FilterDef, type GridColumn, type GridList, type GridQuery, type GridRow } from "@/core/grid";
import { getSettings } from "@/core/settings";
import { ACCOUNT_TYPES, isDebitNormal } from "./module";
import { accountLedger, balanceSheet, incomeStatement, SOURCE_LABELS, sourceHref, trialBalance, type AccountBalance } from "./reports";

// Accounting lists and the statements as grid rows (for the Excel export). Report pages pass their dates
// as f_asof / f_from / f_to and the ledger its account as f_account, so the export gets the same report.

type Opts = { all?: boolean };
const typeLabel = new Map<string, string>(ACCOUNT_TYPES.map((t) => [t.value, t.label]));

/** Report dates from the query, defaulting to today / the start of this year. */
export function reportDates(f: Record<string, string>) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    asOf: dayBound(f.f_asof, false) ?? today,
    from: dayBound(f.f_from, false) ?? new Date(now.getFullYear(), 0, 1),
    to: dayBound(f.f_to, false) ?? today,
  };
}

export async function accountList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [accounts, sums, settings] = await Promise.all([
    db.account.findMany({ orderBy: { code: "asc" } }),
    db.journalLine.groupBy({ by: ["accountId"], where: { branchId: { in: scope.ids } }, _sum: { debit: true, credit: true } }),
    getSettings(),
  ]);
  const currency = settings["company.currency"];
  const byId = new Map(sums.map((s) => [s.accountId, s._sum]));
  type A = (typeof accounts)[number];
  const balanceOf = (a: A) => {
    const s = byId.get(a.id);
    const d = (s?.debit ?? new Prisma.Decimal(0)).minus(s?.credit ?? new Prisma.Decimal(0));
    return Number((isDebitNormal(a.type) ? d : d.negated()).toFixed(2));
  };
  const filters: FilterDef<A>[] = [
    { key: "type", label: "Type", type: "select", options: [...ACCOUNT_TYPES], get: (a) => a.type },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
      get: (a) => (a.isActive ? "active" : "inactive"),
    },
  ];
  const matched = filterGrid(accounts, query, { text: (a) => `${a.code} ${a.name}`, first: (a) => a.name, filters, all: true });
  const columns: GridColumn[] = [
    { key: "code", label: "Code", mono: true },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "use", label: "Used by" },
    { key: "balance", label: scope.current ? `Balance (${scope.current.code})` : "Balance", align: "right" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const rows = matched.rows.map((a) => {
    const balance = balanceOf(a);
    return {
      id: a.id,
      href: `/accounting/accounts/${a.id}`,
      cells: {
        code: a.code,
        name: a.name,
        type: typeLabel.get(a.type) ?? a.type,
        use: a.systemKey ? "Automatic postings" : "-",
        balance: { text: formatMoney(balance, currency), value: balance },
        status: a.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
      },
    };
  });
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}

/** Journal entries, newest first; searched and paged in the database (the journal grows with every posting). */
export async function journalList(query: GridQuery, { all }: Opts = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const currency = (await getSettings())["company.currency"];
  const f = query.filters;
  const like = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const from = dayBound(f.f_date_from, false);
  const to = dayBound(f.f_date_to, true);
  const where: Prisma.JournalEntryWhereInput = {
    lines: { some: { branchId: { in: scope.ids } } },
    ...(f.f_source && { sourceType: f.f_source }),
    ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
    ...(query.q && { OR: [{ number: like(query.q) }, { sourceNumber: like(query.q) }, { memo: like(query.q) }] }),
  };
  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      skip: all ? 0 : (query.page - 1) * GRID_PAGE_SIZE,
      take: all ? 100_000 : GRID_PAGE_SIZE,
      include: { lines: { select: { debit: true } }, createdBy: { select: { name: true } }, reversedBy: { select: { number: true } } },
    }),
    db.journalEntry.count({ where }),
  ]);
  return {
    query,
    total,
    filters: [
      { key: "date", label: "Date", type: "date" },
      { key: "source", label: "Source", type: "select", options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })) },
    ],
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "number", label: "Number", mono: true },
      { key: "source", label: "Source" },
      { key: "document", label: "Document", mono: true },
      { key: "memo", label: "Memo" },
      { key: "amount", label: "Amount", align: "right" },
      { key: "by", label: "By" },
      { key: "status", label: "Status", kind: "status" },
    ],
    rows: entries.map((e) => {
      const amount = Number(e.lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0)).toFixed(2));
      return {
        id: e.id,
        href: `/accounting/journals/${e.id}`,
        cells: {
          date: dateCell(e.date, formatDate),
          number: e.number,
          source: SOURCE_LABELS[e.sourceType] ?? e.sourceType,
          document: e.sourceNumber || "-",
          memo: e.memo || "-",
          amount: { text: formatMoney(amount, currency), value: amount },
          by: e.createdBy?.name ?? "-",
          status: e.reversedBy ? { text: `Reversed by ${e.reversedBy.number}`, tone: "muted" as const } : "Posted",
        },
      };
    }),
  };
}

// ───────────── Statements as grid rows, for the Excel export ─────────────

const plain = (rows: GridRow[], columns: GridColumn[], query: GridQuery): GridList => ({ rows, columns, query, total: rows.length });
const amountCell = (v: number | null, currency: string) => (v === null ? "" : { text: formatMoney(v, currency), value: v });
const reportColumns: GridColumn[] = [
  { key: "code", label: "Code", mono: true },
  { key: "name", label: "Account" },
  { key: "amount", label: "Amount", align: "right" },
];

export async function trialBalanceList(query: GridQuery): Promise<GridList> {
  const scope = await getBranchScope();
  const currency = (await getSettings())["company.currency"];
  const tb = await trialBalance(scope.ids, reportDates(query.filters).asOf);
  const rows: GridRow[] = tb.rows.map((r) => ({
    id: r.account.id,
    cells: { code: r.account.code, name: r.account.name, debit: amountCell(r.debit || null, currency), credit: amountCell(r.credit || null, currency) },
  }));
  rows.push({ id: "total", cells: { code: "", name: "Total", debit: amountCell(tb.totalDebit, currency), credit: amountCell(tb.totalCredit, currency) } });
  return plain(rows, [reportColumns[0], reportColumns[1], { key: "debit", label: "Debit", align: "right" }, { key: "credit", label: "Credit", align: "right" }], query);
}

const accountRows = (rows: AccountBalance[], currency: string): GridRow[] =>
  rows.map((r) => ({ id: r.account.id, cells: { code: r.account.code, name: `  ${r.account.name}`, amount: amountCell(r.balance, currency) } }));
const heading = (id: string, name: string, amount: number | null, currency: string): GridRow => ({
  id,
  cells: { code: "", name, amount: amountCell(amount, currency) },
});

export async function incomeStatementList(query: GridQuery): Promise<GridList> {
  const scope = await getBranchScope();
  const currency = (await getSettings())["company.currency"];
  const { from, to } = reportDates(query.filters);
  const is = await incomeStatement(scope.ids, from, to);
  const [revenue, cost, operating, other] = is.sections;
  const rows = [
    heading("h-rev", revenue.label, null, currency),
    ...accountRows(revenue.rows, currency),
    heading("t-rev", `Total ${revenue.label.toLowerCase()}`, revenue.total, currency),
    heading("h-cos", cost.label, null, currency),
    ...accountRows(cost.rows, currency),
    heading("gp", "Gross profit", is.grossProfit, currency),
    heading("h-op", operating.label, null, currency),
    ...accountRows(operating.rows, currency),
    heading("oi", "Operating income", is.operatingIncome, currency),
    heading("h-oth", other.label, null, currency),
    ...accountRows(other.rows, currency),
    heading("ni", "Net income", is.netIncome, currency),
  ];
  return plain(rows, reportColumns, query);
}

export async function balanceSheetList(query: GridQuery): Promise<GridList> {
  const scope = await getBranchScope();
  const currency = (await getSettings())["company.currency"];
  const bs = await balanceSheet(scope.ids, reportDates(query.filters).asOf);
  const rows = [
    heading("h-a", "Assets", null, currency),
    ...accountRows(bs.assets, currency),
    heading("t-a", "Total assets", bs.totalAssets, currency),
    heading("h-l", "Liabilities", null, currency),
    ...accountRows(bs.liabilities, currency),
    heading("t-l", "Total liabilities", bs.totalLiabilities, currency),
    heading("h-e", "Equity", null, currency),
    ...accountRows(bs.equity, currency),
    heading("re", "  Earnings of earlier years", bs.earlierEarnings, currency),
    heading("ni", "  Net income this year", bs.netIncome, currency),
    heading("t-e", "Total equity", bs.totalEquity, currency),
    heading("t-le", "Total liabilities and equity", Math.round((bs.totalLiabilities + bs.totalEquity) * 100) / 100, currency),
  ];
  return plain(rows, reportColumns, query);
}

export async function ledgerList(query: GridQuery): Promise<GridList> {
  const scope = await getBranchScope();
  const currency = (await getSettings())["company.currency"];
  const { from, to } = reportDates(query.filters);
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Entry", mono: true },
    { key: "document", label: "Document", mono: true },
    { key: "memo", label: "Memo" },
    { key: "branch", label: "Branch" },
    { key: "debit", label: "Debit", align: "right" },
    { key: "credit", label: "Credit", align: "right" },
    { key: "balance", label: "Balance", align: "right" },
  ];
  const ledger = query.filters.f_account ? await accountLedger(scope.ids, query.filters.f_account, from, to) : null;
  if (!ledger) return plain([], columns, query);
  const rows: GridRow[] = [
    { id: "open", cells: { date: "", number: "", document: "", memo: "Opening balance", branch: "", debit: "", credit: "", balance: amountCell(ledger.opening, currency) } },
    ...ledger.rows.map((r) => ({
      id: r.line.id,
      href: sourceHref(r.line.entry),
      cells: {
        date: dateCell(r.line.entry.date, formatDate),
        number: r.line.entry.number,
        document: r.line.entry.sourceNumber || "-",
        memo: [r.line.entry.memo, r.line.customer?.name, r.line.product?.sku, r.line.memo].filter(Boolean).join(" · "),
        branch: r.line.branch.code,
        debit: amountCell(r.debit || null, currency),
        credit: amountCell(r.credit || null, currency),
        balance: amountCell(r.balance, currency),
      },
    })),
  ];
  return plain(rows, columns, query);
}
