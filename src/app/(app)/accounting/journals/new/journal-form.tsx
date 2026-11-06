"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm, FieldErrors, SubmitButton, TextField } from "@/components/ui/form";
import { tableClass } from "@/components/ui/layout";
import { saveManualJournal } from "@/modules/accounting/actions";

type Option = { value: string; label: string };
type Line = { key: number; accountId: string; branchId: string; debit: string; credit: string; memo: string };

const toNumber = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const cell = "w-full rounded-sm border border-border px-1.5 py-1";

export function JournalForm({ accounts, branches, today, currency }: { accounts: Option[]; branches: Option[]; today: string; currency: string }) {
  const blank = (key: number): Line => ({ key, accountId: "", branchId: branches.length === 1 ? branches[0].value : "", debit: "", credit: "", memo: "" });
  const [lines, setLines] = useState<Line[]>([blank(1), blank(2)]);
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency });
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const debits = lines.reduce((s, l) => s + toNumber(l.debit), 0);
  const credits = lines.reduce((s, l) => s + toNumber(l.credit), 0);
  const difference = Math.round((debits - credits) * 100) / 100;
  const payload = JSON.stringify(lines.filter((l) => l.accountId || l.debit || l.credit).map((l) => ({ accountId: l.accountId, branchId: l.branchId, debit: l.debit, credit: l.credit, memo: l.memo })));

  return (
    <ActionForm action={saveManualJournal}>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <TextField name="date" label="Date" type="date" defaultValue={today} required />
        <TextField name="memo" label="Explanation" hint="Why this entry is needed; it stays on the record" required />
      </div>
      <div className="overflow-x-auto border border-border">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className="w-[34%]">Account</th>
              <th>Branch</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th>Line note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <select aria-label="Account" className={cell} value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })}>
                    <option value="">Choose an account…</option>
                    {accounts.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select aria-label="Branch" className={cell} value={l.branchId} onChange={(e) => update(l.key, { branchId: e.target.value })}>
                    <option value="">Choose…</option>
                    {branches.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input aria-label="Debit" inputMode="decimal" className={`${cell} w-28 text-right`} value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                </td>
                <td>
                  <input aria-label="Credit" inputMode="decimal" className={`${cell} w-28 text-right`} value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                </td>
                <td>
                  <input aria-label="Line note" className={cell} value={l.memo} onChange={(e) => update(l.key, { memo: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="px-1 text-muted hover:text-danger disabled:opacity-30" disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td colSpan={2} className="text-right">
                Totals
              </td>
              <td className="text-right tabular-nums">{money.format(debits)}</td>
              <td className="text-right tabular-nums">{money.format(credits)}</td>
              <td colSpan={2} className={difference === 0 ? "text-ok" : "text-danger"}>
                {difference === 0 ? (debits > 0 ? "✓ Balanced" : "") : `Out of balance by ${money.format(Math.abs(difference))}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, blank(Math.max(...ls.map((x) => x.key)) + 1)])}>
        + Add line
      </Button>
      <input type="hidden" name="lines" value={payload} />
      <FieldErrors name="lines" />
      <p className="text-xs text-muted">
        Receivables and inventory cannot be adjusted here; their balances come from invoices, payments and stock movements. A posted entry
        cannot be edited, only reversed.
      </p>
      <SubmitButton pendingText="Posting…" disabled={difference !== 0 || debits === 0}>
        Post entry
      </SubmitButton>
    </ActionForm>
  );
}
