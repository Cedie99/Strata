import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatQty, toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { CONTROL_ACCOUNTS } from "@/modules/accounting/module";
import { P } from "@/modules/purchasing/module";
import { unbilledReceiptLines } from "@/modules/purchasing/posting";
import { BillForm } from "./bill-form";

export const metadata: Metadata = { title: "New supplier bill" };

const pickerClass = "w-full rounded-sm border border-border px-2 py-1.5 text-[13.5px] font-medium";

/** Step 1 picks the supplier and branch (a plain GET form); step 2 is the bill for those two. */
export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ supplierId?: string; branchId?: string }> }) {
  await requirePermission(P.billsPost);
  const scope = await getBranchScope();
  const sp = await searchParams;
  const branchId = sp.branchId && scope.mayUse(sp.branchId) ? sp.branchId : (scope.current?.id ?? (scope.allowed.length === 1 ? scope.allowed[0].id : ""));
  const [suppliers, settings] = await Promise.all([db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), getSettings()]);
  const supplier = suppliers.find((s) => s.id === sp.supplierId);

  const picker = (
    <form className="grid items-end gap-3 sm:grid-cols-[1fr_16rem_auto]">
      <label className="block space-y-1">
        <span className="block text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Supplier</span>
        <select name="supplierId" defaultValue={supplier?.id ?? ""} className={pickerClass} required>
          <option value="">Choose a supplier…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="block text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Branch</span>
        <select name="branchId" defaultValue={branchId} className={pickerClass} required>
          <option value="">Choose…</option>
          {scope.allowed.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} · {b.name}
            </option>
          ))}
        </select>
      </label>
      <button className={buttonClass("secondary")}>Continue</button>
    </form>
  );

  if (!supplier || !branchId) {
    return (
      <>
        <PageHeader title="New supplier bill" description="Enter a supplier's invoice: for goods received on purchase orders, for expenses, or both." />
        <Card className="max-w-3xl">{picker}</Card>
      </>
    );
  }

  const [received, accounts] = await Promise.all([
    unbilledReceiptLines(db, { receipt: { supplierId: supplier.id, branchId } }),
    db.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);
  const blocked = new Set<string>([...CONTROL_ACCOUNTS, "CASH", "INPUT_VAT"]);

  return (
    <>
      <PageHeader title={`New bill · ${supplier.name}`} description={supplier.vatRegistered ? "VAT-registered supplier." : "Non-VAT supplier: no input VAT is recorded."} />
      <Card className="mb-4 max-w-5xl">{picker}</Card>
      <Card className="max-w-5xl">
        <BillForm
          key={`${supplier.id}-${branchId}`}
          supplierId={supplier.id}
          branchId={branchId}
          vatRegistered={supplier.vatRegistered}
          ewtRate={supplier.ewtRate.toString()}
          today={toDateInput(new Date())}
          currency={settings["company.currency"]}
          received={received.map((r) => ({
            id: r.id,
            receipt: r.receipt.number,
            date: formatDate(r.receipt.date),
            product: `${r.product.sku} · ${r.product.name}`,
            qty: `${formatQty(r.qty)} ${r.product.unit}`,
            amount: r.amount.toString(),
            vatCode: r.vatCode,
          }))}
          accounts={accounts.filter((a) => !a.systemKey || !blocked.has(a.systemKey)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
        />
      </Card>
    </>
  );
}
