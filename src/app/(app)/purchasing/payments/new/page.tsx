import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { openBills } from "@/modules/purchasing/lists";
import { P } from "@/modules/purchasing/module";
import { billEwt } from "@/modules/purchasing/posting";
import { daysOverdue } from "@/modules/sales/queries";
import { SupplierPaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Pay supplier" };

export default async function NewSupplierPaymentPage({ searchParams }: { searchParams: Promise<{ supplierId?: string; billId?: string }> }) {
  await requirePermission(P.paymentsPost);
  const scope = await getBranchScope();
  const sp = await searchParams;
  const [suppliers, settings] = await Promise.all([db.supplier.findMany({ orderBy: { name: "asc" } }), getSettings()]);
  const supplier = suppliers.find((s) => s.id === sp.supplierId);

  const picker = (
    <form className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
      <label className="block space-y-1">
        <span className="block text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Supplier</span>
        <select name="supplierId" defaultValue={supplier?.id ?? ""} className="w-full rounded-sm border border-border px-2 py-1.5 text-[13.5px] font-medium" required>
          <option value="">Choose a supplier…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
      </label>
      <button className={buttonClass("secondary")}>Continue</button>
    </form>
  );
  if (!supplier) {
    return (
      <>
        <PageHeader title="Pay supplier" />
        <Card className="max-w-2xl">{picker}</Card>
      </>
    );
  }

  const bills = await openBills(scope.ids, supplier.id);
  const today = new Date();
  return (
    <>
      <PageHeader title={`Pay · ${supplier.name}`} description={supplier.tin ? `TIN ${supplier.tin}` : "No TIN on file: add it before issuing Form 2307."} />
      <Card className="mb-4 max-w-2xl">{picker}</Card>
      <Card className="max-w-5xl">
        {bills.length === 0 ? (
          <p className="text-muted">Nothing is owed to this supplier in your branches.</p>
        ) : (
          <SupplierPaymentForm
            key={supplier.id}
            supplierId={supplier.id}
            preselect={sp.billId}
            today={toDateInput(today)}
            currency={settings["company.currency"]}
            bills={bills.map((b) => ({
              id: b.id,
              number: b.number,
              invoice: b.supplierInvoiceNo,
              branchId: b.branchId,
              branch: `${b.branch.code} · ${b.branch.name}`,
              due: formatDate(b.dueDate),
              overdue: daysOverdue(b.dueDate, today) > 0,
              total: b.total.toString(),
              subtotal: b.subtotal.toString(),
              outstanding: b.outstanding.toString(),
              ewtRate: b.ewtRate.toString(),
              ewtLeft: billEwt(b).minus(b.withheld).toString(),
            }))}
          />
        )}
      </Card>
    </>
  );
}
