import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Card, DataTable, EmptyRow, PageHeader, listTabs, sectionLabel, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P as ACC } from "@/modules/accounting/module";
import { cancelBill } from "@/modules/purchasing/actions";
import { P, VAT_CODES } from "@/modules/purchasing/module";
import { billEwt } from "@/modules/purchasing/posting";
import { daysOverdue } from "@/modules/sales/queries";
import { ConfirmAction } from "../../confirm-action";
import { Field, JournalTrail, Row } from "../../parts";

export const metadata: Metadata = { title: "Supplier bill" };

const ZERO = new Prisma.Decimal(0);
const vatLabel = new Map<string, string>(VAT_CODES.map((v) => [v.value, v.label]));

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [bill, scope, settings] = await Promise.all([
    db.supplierBill.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: true,
        createdBy: { select: { name: true } },
        lines: { include: { account: true, receiptLine: { include: { receipt: { select: { id: true, number: true } } } } } },
        allocations: { include: { payment: true }, orderBy: { payment: { date: "asc" } } },
      },
    }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!bill || !scope.mayUse(bill.branchId)) notFound();
  const journals = await db.journalEntry.findMany({
    where: {
      OR: [
        { sourceId: id, sourceType: { in: ["SupplierBill", "SupplierBillVoid"] } },
        { sourceType: "SupplierPayment", sourceId: { in: bill.allocations.map((a) => a.paymentId) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, memo: true },
  });

  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);
  const paid = bill.allocations.reduce((s, a) => s.plus(a.amount), ZERO);
  const withheld = bill.allocations.reduce((s, a) => s.plus(a.ewt), ZERO);
  const outstanding = bill.total.minus(paid);
  const isVoid = bill.status === "VOID";
  const overdueDays = daysOverdue(bill.dueDate, new Date());
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
        title={`${bill.number} · ${bill.supplier.name}`}
        description={isVoid ? `Voided ${bill.voidedAt ? formatDateTime(bill.voidedAt) : ""}. Its received goods can be billed again.` : undefined}
        actions={
          !isVoid && (
            <>
              {outstanding.greaterThan(0) && can(user, P.paymentsPost) && (
                <LinkButton href={`/purchasing/payments/new?supplierId=${bill.supplierId}&billId=${id}`} variant="secondary">
                  Pay this bill
                </LinkButton>
              )}
              {bill.allocations.length === 0 && can(user, P.billsPost) && (
                <ConfirmAction action={cancelBill.bind(null, id)} label="Void bill" title="Void this bill?" items={[bill.number]}>
                  Its accounting entry is reversed and any received goods on it become billable again. The number is kept and cannot be reused.
                </ConfirmAction>
              )}
            </>
          )
        }
      />
      <Tabs tabs={listTabs("/purchasing/bills", true)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Bill">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Field label="Supplier">
                <Link href={`/purchasing/suppliers/${bill.supplierId}`} className="text-primary hover:underline">
                  {bill.supplier.code} · {bill.supplier.name}
                </Link>
              </Field>
              <Field label="Supplier invoice">{bill.supplierInvoiceNo}</Field>
              <Field label="TIN">{bill.supplier.tin || "-"}</Field>
              <Field label="Invoice date">{formatDate(bill.date)}</Field>
              <Field label="Due">{formatDate(bill.dueDate)}</Field>
              <Field label="Branch">{bill.branch.code}</Field>
              <Field label="Withholding">{bill.ewtRate.isZero() ? "None" : `${bill.ewtRate.toString()}%${bill.atc ? ` · ${bill.atc}` : ""}`}</Field>
              <Field label="Posted by">
                {bill.createdBy?.name ?? "-"}, {formatDateTime(bill.createdAt)}
              </Field>
            </dl>
            {bill.note && <p className="mt-4 whitespace-pre-wrap text-muted">{bill.note}</p>}
          </Card>
          <DataTable>
            <thead>
              <tr>
                <th>Line</th>
                <th>From</th>
                <th className="text-right">Qty</th>
                <th>VAT</th>
                <th className="text-right">Net</th>
                <th className="text-right">VAT amount</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td>
                    {l.receiptLine ? (
                      <Link href={`/purchasing/receipts/${l.receiptLine.receipt.id}`} className="font-mono text-primary hover:underline">
                        {l.receiptLine.receipt.number}
                      </Link>
                    ) : (
                      <span className="text-muted">{l.account ? `${l.account.code} · ${l.account.name}` : "-"}</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{formatQty(l.qty)}</td>
                  <td>{vatLabel.get(l.vatCode) ?? l.vatCode}</td>
                  <td className="text-right tabular-nums">{money(l.amount)}</td>
                  <td className="text-right text-muted tabular-nums">{money(l.vat)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        <Card title="Summary">
          <dl className="space-y-1.5">
            <Row label="Net of VAT" value={money(bill.subtotal)} />
            <Row label="Input VAT" value={money(bill.vat)} />
            <Row label="Total" value={money(bill.total)} strong />
            <Row label="EWT on the whole bill" value={money(billEwt(bill))} />
            <Row label="Paid (incl. withholding)" value={money(paid)} />
            <Row label="Withheld so far" value={money(withheld)} />
            <Row label="Outstanding" value={isVoid ? "-" : money(outstanding)} strong />
            <Row label="Status" value={status} danger={!isVoid && outstanding.greaterThan(0) && overdueDays > 0} />
          </dl>
        </Card>
      </div>

      {can(user, ACC.view) && <JournalTrail journals={journals} />}
      <h2 className={`mt-8 mb-2 px-1 ${sectionLabel}`}>Payments</h2>
      <DataTable>
        <thead>
          <tr>
            <th>Date</th>
            <th>Number</th>
            <th>Check / ref.</th>
            <th className="text-right">Applied</th>
            <th className="text-right">EWT</th>
            <th className="text-right">Cash</th>
          </tr>
        </thead>
        <tbody>
          {bill.allocations.length === 0 && <EmptyRow colSpan={6}>No payments yet.</EmptyRow>}
          {bill.allocations.map((a) => (
            <tr key={a.id}>
              <td>{formatDate(a.payment.date)}</td>
              <td className="font-mono">
                <Link href={`/purchasing/payments/${a.paymentId}`} className="text-primary hover:underline">
                  {a.payment.number}
                </Link>
              </td>
              <td>{a.payment.reference || "-"}</td>
              <td className="text-right tabular-nums">{money(a.amount)}</td>
              <td className="text-right tabular-nums">{money(a.ewt)}</td>
              <td className="text-right tabular-nums">{money(a.amount.minus(a.ewt))}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
