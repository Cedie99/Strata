import "server-only";
import { Prisma } from "@prisma/client";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { dateCell, filterGrid, finishGrid, type FilterDef, type GridColumn, type GridList, type GridQuery } from "@/core/grid";
import { getSettings } from "@/core/settings";
import { CASH_CATEGORIES } from "./module";

const num = (d: Prisma.Decimal) => Number(d.toString());

/**
 * The cash book: cash entries plus customer payments (shown as "Customer payment", linking to the invoice)
 * and payments to suppliers (cash out, net of the withholding tax kept),
 * so the list adds up to the same cash flow the dashboard shows. Callers check permissions.
 */
export async function cashList(query: GridQuery, { all }: { all?: boolean } = {}): Promise<GridList> {
  const scope = await getBranchScope();
  const [entries, payments, supplierPayments, settings] = await Promise.all([
    db.cashEntry.findMany({ where: { branchId: { in: scope.ids } }, include: { branch: true, createdBy: { select: { name: true } } } }),
    db.payment.findMany({
      where: { invoice: { branchId: { in: scope.ids } } },
      include: { invoice: { include: { branch: true, customer: true } }, createdBy: { select: { name: true } } },
    }),
    db.supplierPayment.findMany({
      where: { branchId: { in: scope.ids } },
      include: { branch: true, supplier: true, createdBy: { select: { name: true } } },
    }),
    getSettings(),
  ]);
  const currency = settings["company.currency"];
  const lines = [
    ...entries.map((e) => ({
      id: e.id,
      href: undefined as string | undefined,
      date: e.date,
      number: e.number,
      branchId: e.branchId,
      branch: e.branch.code,
      direction: e.direction,
      category: e.category,
      description: e.note || "-",
      reference: e.reference,
      amount: e.direction === "IN" ? e.amount : e.amount.negated(),
      by: e.createdBy?.name ?? "-",
    })),
    ...payments.map((p) => ({
      id: p.id,
      href: `/sales/invoices/${p.invoiceId}`,
      date: p.date,
      number: p.number,
      branchId: p.invoice.branchId,
      branch: p.invoice.branch.code,
      direction: "IN",
      category: "Customer payment",
      description: `${p.invoice.customer.name} · ${p.invoice.number}`,
      reference: p.reference,
      amount: p.amount,
      by: p.createdBy?.name ?? "-",
    })),
    ...supplierPayments.map((p) => ({
      id: p.id,
      href: `/purchasing/payments/${p.id}` as string | undefined,
      date: p.date,
      number: p.number,
      branchId: p.branchId,
      branch: p.branch.code,
      direction: "OUT",
      category: "Payment to supplier",
      description: p.supplier.name,
      reference: p.reference,
      amount: p.net.negated(),
      by: p.createdBy?.name ?? "-",
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime() || b.number.localeCompare(a.number));
  type L = (typeof lines)[number];

  const filters: FilterDef<L>[] = [
    { key: "date", label: "Date", type: "date", get: (l) => l.date },
    {
      key: "direction",
      label: "Direction",
      type: "select",
      options: [
        { value: "IN", label: "Cash in (+)" },
        { value: "OUT", label: "Cash out (−)" },
      ],
      get: (l) => l.direction,
    },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: ["Customer payment", "Payment to supplier", ...CASH_CATEGORIES.IN, ...CASH_CATEGORIES.OUT].map((c) => ({ value: c, label: c })),
      get: (l) => l.category,
    },
    {
      key: "branch",
      label: "Branch",
      type: "select",
      options: scope.allowed.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })),
      get: (l) => l.branchId,
    },
  ];
  const matched = filterGrid(lines, query, {
    text: (l) => `${l.number} ${l.category} ${l.description} ${l.reference}`,
    first: (l) => l.category,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "date", label: "Date", kind: "date" },
    { key: "number", label: "Number", mono: true },
    { key: "branch", label: "Branch" },
    { key: "category", label: "Category" },
    { key: "description", label: "Description" },
    { key: "reference", label: "Reference" },
    { key: "amount", label: "Amount", align: "right" },
    { key: "by", label: "By" },
  ];
  const rows = matched.rows.map((l) => ({
    id: l.id,
    href: l.href,
    cells: {
      date: dateCell(l.date, formatDate),
      number: l.number,
      branch: l.branch,
      category: l.category,
      description: l.description,
      reference: l.reference || "-",
      amount: {
        text: `${l.amount.isNegative() ? "" : "+"}${formatMoney(l.amount, currency)}`,
        tone: l.amount.isNegative() ? ("danger" as const) : ("ok" as const),
        value: num(l.amount),
      },
      by: l.by,
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}
