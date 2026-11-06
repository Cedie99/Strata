import { Prisma } from "@prisma/client";
import { PrintButton, PrintLink } from "@/components/print/print-button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DataTable, EmptyRow, PageHeader, listTabs, sectionLabel, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatDateTime, formatMoney, formatQty, toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { VAT_CODES } from "@/core/tax";
import { P as ACC } from "@/modules/accounting/module";
import { cancelInvoice } from "@/modules/sales/actions";
import { P, PAYMENT_METHODS } from "@/modules/sales/module";
import { daysOverdue } from "@/modules/sales/queries";
import { PaymentForm, VoidInvoiceButton } from "./invoice-actions";

export const metadata: Metadata = { title: "Sales invoice" };

const ZERO = new Prisma.Decimal(0);

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [invoice, scope, settings, journals] = await Promise.all([
    db.salesInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        branch: true,
        warehouse: true,
        createdBy: { select: { name: true } },
        lines: { include: { product: true } },
        payments: { orderBy: { date: "asc" }, include: { createdBy: { select: { name: true } } } },
      },
    }),
    getBranchScope(),
    getSettings(),
    // The accounting trail: the invoice's entry, its void, and the entries of its payments.
    db.journalEntry.findMany({
      where: { OR: [{ sourceId: id, sourceType: { in: ["SalesInvoice", "SalesInvoiceVoid"] } }, { sourceType: "Payment", sourceId: { in: (await db.payment.findMany({ where: { invoiceId: id }, select: { id: true } })).map((p) => p.id) } }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, number: true, memo: true, date: true },
    }),
  ]);
  // Invoices of other branches are hidden like their warehouses are.
  if (!invoice || !scope.mayUse(invoice.branchId)) notFound();

  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  const paid = invoice.payments.reduce((s, p) => s.plus(p.amount), ZERO);
  const outstanding = invoice.total.minus(paid);
  const grossProfit = invoice.subtotal.minus(invoice.costTotal);
  const withheld = invoice.payments.reduce((s, p) => s.plus(p.cwt), ZERO);
  const vatLabel = new Map<string, string>(VAT_CODES.map((c) => [c.value, c.label]));
  const isVoid = invoice.status === "VOID";
  const overdueDays = daysOverdue(invoice.dueDate, new Date());
  const methodLabel = new Map<string, string>(PAYMENT_METHODS.map((m) => [m.value, m.label]));

  const status = isVoid
    ? "Void"
    : outstanding.lte(0)
      ? "Paid"
      : overdueDays > 0
        ? `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`
        : paid.greaterThan(0)
          ? "Partly paid"
          : "Unpaid";

  return (
    <>
      <PageHeader
        title={`${invoice.number} · ${invoice.customer.name}`}
        description={isVoid ? `Voided ${invoice.voidedAt ? formatDateTime(invoice.voidedAt) : ""}. Its stock was received back.` : undefined}
        actions={
          <>
            <PrintButton href={`/print/sales-invoice/${id}`} />
            {!isVoid && invoice.payments.length === 0 && can(user, P.invoicesPost) && <VoidInvoiceButton action={cancelInvoice.bind(null, id)} number={invoice.number} />}
          </>
        }
      />
      <Tabs tabs={listTabs("/sales/invoices", true)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Invoice">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Field label="Customer">
                <Link href={`/sales/customers/${invoice.customerId}`} className="text-primary hover:underline">
                  {invoice.customer.code} · {invoice.customer.name}
                </Link>
              </Field>
              <Field label="Invoice date">{formatDate(invoice.date)}</Field>
              <Field label="Due">{formatDate(invoice.dueDate)}</Field>
              <Field label="Branch / warehouse">
                {invoice.branch.code} / {invoice.warehouse.code}
              </Field>
              <Field label="Reference">{invoice.reference || "-"}</Field>
              <Field label="Posted by">
                {invoice.createdBy?.name ?? "-"}, {formatDateTime(invoice.createdAt)}
              </Field>
            </dl>
            {invoice.note && <p className="mt-4 whitespace-pre-wrap text-muted">{invoice.note}</p>}
          </Card>
          <DataTable>
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit price</th>
                <th className="text-right">Amount</th>
                <th>VAT</th>
                <th className="text-right">Unit cost</th>
                <th className="text-right">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => {
                const gp = l.amount.minus(l.qty.times(l.unitCost));
                return (
                  <tr key={l.id}>
                    <td>
                      {l.product.sku} · {l.product.name}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatQty(l.qty)} {l.product.unit}
                    </td>
                    <td className="text-right tabular-nums">{money(l.unitPrice)}</td>
                    <td className="text-right tabular-nums">{money(l.amount)}</td>
                    <td className="text-muted">
                      {vatLabel.get(l.vatCode) ?? l.vatCode}
                      {l.vat.greaterThan(0) && <span className="ml-1 tabular-nums">{money(l.vat)}</span>}
                    </td>
                    <td className="text-right text-muted tabular-nums">{money(l.unitCost)}</td>
                    <td className={`text-right tabular-nums ${gp.isNegative() ? "text-danger" : ""}`}>{money(gp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>

        <div className="space-y-6">
          <Card title="Summary">
            <dl className="space-y-1.5">
              <Row label="Net of VAT" value={money(invoice.subtotal)} />
              <Row label="VAT" value={money(invoice.vat)} />
              <Row label="Total" value={money(invoice.total)} strong />
              <Row label="Cost of goods" value={money(invoice.costTotal)} />
              <Row
                label="Gross profit"
                value={`${money(grossProfit)} · ${invoice.subtotal.isZero() ? "–" : `${grossProfit.div(invoice.subtotal).times(100).toFixed(1)}%`}`}
              />
              <Row label="Paid" value={money(paid)} />
              {withheld.greaterThan(0) && <Row label="of which tax withheld" value={money(withheld)} />}
              <Row label="Outstanding" value={isVoid ? "-" : money(outstanding)} strong />
              <Row label="Status" value={status} danger={!isVoid && outstanding.greaterThan(0) && overdueDays > 0} />
            </dl>
          </Card>
          {!isVoid && outstanding.greaterThan(0) && can(user, P.paymentsPost) && (
            <Card title="Record payment">
              <PaymentForm
                invoiceId={id}
                outstanding={outstanding.toFixed(2)}
                today={toDateInput(new Date())}
                subtotal={Number(invoice.subtotal)}
                total={Number(invoice.total)}
                cwtRate={Number(invoice.customer.cwtRate)}
                atc={invoice.customer.cwtAtc}
              />
            </Card>
          )}
        </div>
      </div>

      {can(user, ACC.view) && journals.length > 0 && (
        <p className="mt-6 px-1 text-xs text-muted">
          Accounting entries:{" "}
          {journals.map((j, i) => (
            <span key={j.id}>
              {i > 0 && " · "}
              <Link href={`/accounting/journals/${j.id}`} className="font-mono text-primary hover:underline">
                {j.number}
              </Link>{" "}
              ({j.memo})
            </span>
          ))}
        </p>
      )}
      <h2 className={`mt-8 mb-2 px-1 ${sectionLabel}`}>Payments</h2>
      <DataTable>
        <thead>
          <tr>
            <th>Date</th>
            <th>Number</th>
            <th>Method</th>
            <th>Reference</th>
            <th>By</th>
            <th className="text-right">Amount applied</th>
            <th className="text-right">Tax withheld</th>
            <th className="text-right">Cash</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoice.payments.length === 0 && <EmptyRow colSpan={9}>No payments yet.</EmptyRow>}
          {invoice.payments.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.date)}</td>
              <td className="font-mono">{p.number}</td>
              <td>{methodLabel.get(p.method) ?? p.method}</td>
              <td>{p.reference || "-"}</td>
              <td>{p.createdBy?.name ?? "-"}</td>
              <td className="text-right tabular-nums">{money(p.amount)}</td>
              <td className="text-right tabular-nums">{p.cwt.isZero() ? "-" : `${money(p.cwt)}${p.atc ? ` · ${p.atc}` : ""}`}</td>
              <td className="text-right tabular-nums">{money(p.amount.minus(p.cwt))}</td>
              <td className="text-right">
                <PrintLink href={`/print/payment/${p.id}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={sectionLabel}>{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${danger ? "font-semibold text-danger" : ""}`}>{value}</dd>
    </div>
  );
}
