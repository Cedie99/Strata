import { Prisma } from "@prisma/client";
import { PrintButton } from "@/components/print/print-button";
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
import { saveCustomer } from "@/modules/sales/actions";
import { P } from "@/modules/sales/module";
import { daysOverdue } from "@/modules/sales/queries";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Customer" };

const ZERO = new Prisma.Decimal(0);

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  const scope = await getBranchScope();
  const [invoices, settings] = await Promise.all([
    db.salesInvoice.findMany({
      where: { customerId: id, branchId: { in: scope.ids } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
      include: { payments: { select: { amount: true } } },
    }),
    getSettings(),
  ]);
  const currency = settings["company.currency"];
  const today = new Date();
  const rows = invoices.map((i) => ({
    ...i,
    balance: i.status === "VOID" ? null : i.total.minus(i.payments.reduce((s, p) => s.plus(p.amount), ZERO)),
  }));
  const owed = rows.reduce((s, r) => s.plus(r.balance ?? ZERO), ZERO);
  const overdue = rows.reduce((s, r) => (r.balance && daysOverdue(r.dueDate, today) > 0 ? s.plus(r.balance) : s), ZERO);

  return (
    <>
      <PageHeader
        title={`${customer.code} · ${customer.name}`}
        actions={
          <>
            <PrintButton href={`/print/statement/${id}`} label="Statement of account" />
            {can(user, P.invoicesPost) && customer.isActive && (
              <LinkButton href={`/sales/invoices/new?customerId=${id}`} variant="secondary">
                New invoice
              </LinkButton>
            )}
          </>
        }
      />
      <Tabs tabs={listTabs("/sales/customers", true)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Details">
          <CustomerForm
            action={saveCustomer.bind(null, id)}
            readOnly={!can(user, P.customersManage)}
            values={{
              code: customer.code,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              address: customer.address,
              termsDays: String(customer.termsDays),
              tin: customer.tin,
              vatCode: customer.vatCode,
              cwtRate: customer.cwtRate.toString(),
              cwtAtc: customer.cwtAtc,
              isActive: customer.isActive,
            }}
          />
        </Card>
        <Card title={scope.current ? `Account (${scope.current.code})` : "Account"}>
          <dl className="space-y-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Owed</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(owed, currency)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Overdue</dt>
              <dd className={`tabular-nums ${overdue.greaterThan(0) ? "font-semibold text-danger" : ""}`}>{formatMoney(overdue, currency)}</dd>
            </div>
          </dl>
        </Card>
      </div>
      <h2 className={`mt-8 mb-2 px-1 ${sectionLabel}`}>Invoices</h2>
      <DataTable>
        <thead>
          <tr>
            <th>Date</th>
            <th>Number</th>
            <th>Due</th>
            <th className="text-right">Total</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={5}>No invoices yet.</EmptyRow>}
          {rows.map((i) => (
            <tr key={i.id}>
              <td>{formatDate(i.date)}</td>
              <td className="font-mono">
                <Link href={`/sales/invoices/${i.id}`} className="text-primary hover:underline">
                  {i.number}
                </Link>
              </td>
              <td>{formatDate(i.dueDate)}</td>
              <td className="text-right tabular-nums">{formatMoney(i.total, currency)}</td>
              <td className="text-right tabular-nums">{i.balance ? formatMoney(i.balance, currency) : "Void"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
