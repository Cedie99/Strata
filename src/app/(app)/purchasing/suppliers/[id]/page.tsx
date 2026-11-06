import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Card, DataTable, EmptyRow, PageHeader, listTabs, sectionLabel, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { saveSupplier } from "@/modules/purchasing/actions";
import { P } from "@/modules/purchasing/module";
import { daysOverdue } from "@/modules/sales/queries";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "Supplier" };

const ZERO = new Prisma.Decimal(0);

/** Adds the balance after each line (charges raise it, payments lower it). */
function withRunningBalance<T extends { charge: Prisma.Decimal; paid: Prisma.Decimal }>(lines: T[]) {
  const out: (T & { balance: Prisma.Decimal })[] = [];
  for (const l of lines) out.push({ ...l, balance: (out.at(-1)?.balance ?? ZERO).plus(l.charge).minus(l.paid) });
  return out;
}

/** Supplier details plus a statement: every bill and payment in date order with the running balance owed. */
export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const supplier = await db.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  const scope = await getBranchScope();
  const [bills, payments, settings] = await Promise.all([
    db.supplierBill.findMany({ where: { supplierId: id, branchId: { in: scope.ids } }, include: { allocations: { select: { amount: true } } } }),
    db.supplierPayment.findMany({ where: { supplierId: id, branchId: { in: scope.ids } } }),
    getSettings(),
  ]);
  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  const today = new Date();

  const open = bills.filter((b) => b.status === "POSTED").map((b) => ({ ...b, balance: b.total.minus(b.allocations.reduce((s, a) => s.plus(a.amount), ZERO)) }));
  const owed = open.reduce((s, b) => s.plus(b.balance), ZERO);
  const overdue = open.reduce((s, b) => (b.balance.greaterThan(0) && daysOverdue(b.dueDate, today) > 0 ? s.plus(b.balance) : s), ZERO);

  // Statement lines: bills raise the balance, payments (cash + withholding) lower it. Void bills are left out.
  const statement = withRunningBalance([
    ...bills.filter((b) => b.status === "POSTED").map((b) => ({ date: b.date, key: b.id, href: `/purchasing/bills/${b.id}`, number: b.number, text: `Bill · invoice ${b.supplierInvoiceNo}`, charge: b.total, paid: ZERO })),
    ...payments.map((p) => ({ date: p.date, key: p.id, href: `/purchasing/payments/${p.id}`, number: p.number, text: p.ewt.greaterThan(0) ? `Payment (incl. ${money(p.ewt)} withheld)` : "Payment", charge: ZERO, paid: p.gross })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.number.localeCompare(b.number)));

  return (
    <>
      <PageHeader
        title={`${supplier.code} · ${supplier.name}`}
        actions={
          supplier.isActive && (
            <>
              {can(user, P.ordersManage) && (
                <LinkButton href={`/purchasing/orders/new?supplierId=${id}`} variant="secondary">
                  New PO
                </LinkButton>
              )}
              {can(user, P.billsPost) && (
                <LinkButton href={`/purchasing/bills/new?supplierId=${id}`} variant="secondary">
                  New bill
                </LinkButton>
              )}
              {can(user, P.paymentsPost) && owed.greaterThan(0) && (
                <LinkButton href={`/purchasing/payments/new?supplierId=${id}`} variant="secondary">
                  Pay bills
                </LinkButton>
              )}
            </>
          )
        }
      />
      <Tabs tabs={listTabs("/purchasing/suppliers", true)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Details">
          <SupplierForm
            action={saveSupplier.bind(null, id)}
            readOnly={!can(user, P.suppliersManage)}
            values={{
              code: supplier.code,
              name: supplier.name,
              tin: supplier.tin,
              email: supplier.email,
              phone: supplier.phone,
              address: supplier.address,
              termsDays: String(supplier.termsDays),
              vatRegistered: supplier.vatRegistered,
              ewtRate: supplier.ewtRate.toString(),
              isActive: supplier.isActive,
            }}
          />
        </Card>
        <Card title={scope.current ? `Account (${scope.current.code})` : "Account"}>
          <dl className="space-y-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">We owe</dt>
              <dd className="font-semibold tabular-nums">{money(owed)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Overdue</dt>
              <dd className={`tabular-nums ${overdue.greaterThan(0) ? "font-semibold text-danger" : ""}`}>{money(overdue)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <h2 className={`mt-8 mb-2 px-1 ${sectionLabel}`}>Statement of account</h2>
      <DataTable>
        <thead>
          <tr>
            <th>Date</th>
            <th>Number</th>
            <th>Description</th>
            <th className="text-right">Billed</th>
            <th className="text-right">Paid</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {statement.length === 0 && <EmptyRow colSpan={6}>No bills or payments yet.</EmptyRow>}
          {statement.map((l) => (
            <tr key={l.key}>
              <td>{formatDate(l.date)}</td>
              <td className="font-mono">
                <Link href={l.href} className="text-primary hover:underline">
                  {l.number}
                </Link>
              </td>
              <td>{l.text}</td>
              <td className="text-right tabular-nums">{l.charge.isZero() ? "" : money(l.charge)}</td>
              <td className="text-right tabular-nums">{l.paid.isZero() ? "" : money(l.paid)}</td>
              <td className="text-right font-medium tabular-nums">{money(l.balance)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
