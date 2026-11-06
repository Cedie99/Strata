"use client";

import { useState } from "react";
import { ActionForm, FieldErrors, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { tableClass } from "@/components/ui/layout";
import { saveSupplierPayment } from "@/modules/purchasing/actions";
import { PAYMENT_METHODS } from "@/modules/sales/module";

export type OpenBill = {
  id: string;
  number: string;
  invoice: string;
  branchId: string;
  branch: string;
  due: string;
  overdue: boolean;
  total: string;
  subtotal: string;
  outstanding: string;
  ewtRate: string;
  ewtLeft: string; // withholding not yet taken on this bill
};

const toNumber = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Same rule as the server: the last payment of a bill takes the withholding that is left. */
const ewtFor = (b: OpenBill, amount: number) =>
  amount <= 0
    ? 0
    : Math.abs(amount - toNumber(b.outstanding)) < 0.005
      ? toNumber(b.ewtLeft)
      : round2(((amount * toNumber(b.subtotal)) / toNumber(b.total)) * (toNumber(b.ewtRate) / 100));

export function SupplierPaymentForm({ supplierId, bills, preselect, today, currency }: { supplierId: string; bills: OpenBill[]; preselect?: string; today: string; currency: string }) {
  const branches = [...new Map(bills.map((b) => [b.branchId, b.branch])).entries()];
  const [branchId, setBranchId] = useState(bills.find((b) => b.id === preselect)?.branchId ?? branches[0]?.[0] ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(bills.map((b) => [b.id, !preselect || b.id === preselect ? b.outstanding : ""])),
  );
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency });
  const shown = bills.filter((b) => b.branchId === branchId);
  const chosen = shown.filter((b) => toNumber(amounts[b.id]) > 0);
  const gross = chosen.reduce((s, b) => s + toNumber(amounts[b.id]), 0);
  const ewt = chosen.reduce((s, b) => s + ewtFor(b, toNumber(amounts[b.id])), 0);
  const payload = JSON.stringify(chosen.map((b) => ({ billId: b.id, amount: amounts[b.id].trim() })));

  return (
    <ActionForm action={saveSupplierPayment}>
      <input type="hidden" name="supplierId" value={supplierId} />
      {branches.length > 1 && (
        <SelectField
          name="branchPick"
          label="Branch"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          options={branches.map(([value, label]) => ({ value, label }))}
          hint="One payment settles the bills of one branch"
        />
      )}
      <div className="overflow-x-auto border border-border">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Bill</th>
              <th>Supplier invoice</th>
              <th>Due</th>
              <th className="text-right">Outstanding</th>
              <th className="text-right">Pay</th>
              <th className="text-right">EWT</th>
              <th className="text-right">Cash</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => {
              const amount = toNumber(amounts[b.id]);
              const w = ewtFor(b, amount);
              return (
                <tr key={b.id}>
                  <td className="font-mono">{b.number}</td>
                  <td>{b.invoice}</td>
                  <td className={b.overdue ? "font-semibold text-danger" : ""}>{b.due}</td>
                  <td className="text-right tabular-nums">{money.format(toNumber(b.outstanding))}</td>
                  <td className="text-right">
                    <input
                      aria-label={`Pay on ${b.number}`}
                      inputMode="decimal"
                      className="w-28 rounded-sm border border-border px-1.5 py-1 text-right"
                      value={amounts[b.id]}
                      placeholder="0.00"
                      onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: e.target.value }))}
                    />
                  </td>
                  <td className="text-right text-muted tabular-nums">{w ? money.format(w) : "-"}</td>
                  <td className="text-right tabular-nums">{amount ? money.format(amount - w) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td colSpan={4} className="text-right">
                Total
              </td>
              <td className="text-right tabular-nums">{money.format(gross)}</td>
              <td className="text-right tabular-nums">{money.format(ewt)}</td>
              <td className="text-right tabular-nums">{money.format(gross - ewt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <input type="hidden" name="allocations" value={payload} />
      <FieldErrors name="allocations" />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="date" label="Payment date" type="date" defaultValue={today} required />
        <SelectField name="method" label="Method" options={[...PAYMENT_METHODS]} defaultValue="CHECK" />
        <TextField name="reference" label="Check / transfer no." />
      </div>
      <TextAreaField name="note" label="Note" />
      <SubmitButton pendingText="Recording…">Record payment of {money.format(gross - ewt)}</SubmitButton>
      <p className="text-xs text-muted">
        The withholding tax is kept and owed to the BIR (Form 2307 goes to the supplier). The bills are reduced by the full amount paid plus withheld.
      </p>
    </ActionForm>
  );
}
