"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm, FieldErrors, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { tableClass } from "@/components/ui/layout";
import { saveBill } from "@/modules/purchasing/actions";
import { EWT_PRESETS, VAT_CODES, VAT_RATE } from "@/modules/purchasing/module";

type Option = { value: string; label: string };
export type ReceivedLine = { id: string; receipt: string; date: string; product: string; qty: string; amount: string; vatCode: string };
type Expense = { key: number; accountId: string; description: string; amount: string; vatCode: string };

const toNumber = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
const cell = "w-full rounded-sm border border-border px-1.5 py-1";

export function BillForm({
  supplierId,
  branchId,
  vatRegistered,
  ewtRate,
  received,
  accounts,
  today,
  currency,
}: {
  supplierId: string;
  branchId: string;
  vatRegistered: boolean;
  ewtRate: string;
  received: ReceivedLine[];
  accounts: Option[];
  today: string;
  currency: string;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(received.map((r) => r.id)));
  const [expenses, setExpenses] = useState<Expense[]>(received.length ? [] : [{ key: 1, accountId: "", description: "", amount: "", vatCode: "VAT" }]);
  const [rate, setRate] = useState(ewtRate);
  const [atc, setAtc] = useState<string>(EWT_PRESETS.find((p) => Number(p.value) === Number(ewtRate))?.atc ?? "");
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency });

  const vat = (net: number, code: string) => (vatRegistered && code === "VAT" ? round2(net * VAT_RATE) : 0);
  const goods = received.filter((r) => picked.has(r.id));
  const net = goods.reduce((s, r) => s + toNumber(r.amount), 0) + expenses.reduce((s, e) => s + round2(toNumber(e.amount)), 0);
  const vatTotal = goods.reduce((s, r) => s + vat(toNumber(r.amount), r.vatCode), 0) + expenses.reduce((s, e) => s + vat(round2(toNumber(e.amount)), e.vatCode), 0);
  const ewt = round2((net * toNumber(rate)) / 100);
  const updateExpense = (key: number, patch: Partial<Expense>) => setExpenses((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  return (
    <ActionForm action={saveBill}>
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="branchId" value={branchId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="supplierInvoiceNo" label="Supplier invoice / OR no." required hint="As printed on the supplier's invoice" />
        <TextField name="date" label="Invoice date" type="date" defaultValue={today} required />
        <TextField name="dueDate" label="Due date" type="date" hint="Blank = from the supplier's terms" />
      </div>

      {received.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Received goods not yet billed</p>
          <div className="overflow-x-auto border border-border">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Bill all"
                      className="size-4 accent-primary"
                      checked={picked.size === received.length}
                      onChange={(e) => setPicked(new Set(e.target.checked ? received.map((r) => r.id) : []))}
                    />
                  </th>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Net</th>
                  <th className="text-right">VAT</th>
                </tr>
              </thead>
              <tbody>
                {received.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Bill ${r.product}`}
                        className="size-4 accent-primary"
                        checked={picked.has(r.id)}
                        onChange={(e) =>
                          setPicked((p) => {
                            const next = new Set(p);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="font-mono">{r.receipt}</td>
                    <td>{r.date}</td>
                    <td>{r.product}</td>
                    <td className="text-right tabular-nums">{r.qty}</td>
                    <td className="text-right tabular-nums">{money.format(toNumber(r.amount))}</td>
                    <td className="text-right text-muted tabular-nums">{money.format(vat(toNumber(r.amount), r.vatCode))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-muted">Billed at the PO cost. If the supplier&apos;s invoice differs, add the difference as an expense line.</p>
        </div>
      )}

      <div>
        <p className="mb-1 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
          Expenses and services <span className="font-normal tracking-normal normal-case">(amounts net of VAT)</span>
        </p>
        {expenses.length > 0 && (
          <div className="overflow-x-auto border border-border">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className="w-[30%]">Account</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th>VAT</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.key}>
                    <td>
                      <select aria-label="Account" className={cell} value={e.accountId} onChange={(ev) => updateExpense(e.key, { accountId: ev.target.value })}>
                        <option value="">Choose an account…</option>
                        {accounts.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input aria-label="Description" className={cell} value={e.description} onChange={(ev) => updateExpense(e.key, { description: ev.target.value })} />
                    </td>
                    <td className="text-right">
                      <input aria-label="Amount" inputMode="decimal" className="w-28 rounded-sm border border-border px-1.5 py-1 text-right" value={e.amount} onChange={(ev) => updateExpense(e.key, { amount: ev.target.value })} />
                    </td>
                    <td>
                      <select aria-label="VAT" className={cell} value={vatRegistered ? e.vatCode : "EXEMPT"} disabled={!vatRegistered} onChange={(ev) => updateExpense(e.key, { vatCode: ev.target.value })}>
                        {VAT_CODES.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">
                      <button type="button" className="px-1 text-muted hover:text-danger" onClick={() => setExpenses((es) => es.filter((x) => x.key !== e.key))} aria-label="Remove line">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          onClick={() => setExpenses((es) => [...es, { key: Math.max(0, ...es.map((x) => x.key)) + 1, accountId: "", description: "", amount: "", vatCode: "VAT" }])}
        >
          + Add expense line
        </Button>
      </div>
      <input type="hidden" name="receiptLineIds" value={JSON.stringify([...picked])} />
      <input type="hidden" name="expenses" value={JSON.stringify(expenses.map(({ accountId, description, amount, vatCode }) => ({ accountId, description, amount, vatCode })))} />
      <FieldErrors name="receiptLineIds" />
      <FieldErrors name="expenses" />

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_16rem]">
        <SelectField
          name="ewtPreset"
          label="Withholding to deduct when paying"
          value={EWT_PRESETS.some((p) => Number(p.value) === Number(rate)) ? String(Number(rate)) : ""}
          onChange={(e) => {
            const preset = EWT_PRESETS.find((p) => p.value === e.target.value);
            if (preset) {
              setRate(preset.value);
              setAtc(preset.atc);
            }
          }}
          options={[...EWT_PRESETS.map((p) => ({ value: p.value, label: p.label })), { value: "", label: "Other rate…" }]}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField name="ewtRate" label="EWT %" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required />
          <TextField name="atc" label="ATC" value={atc} onChange={(e) => setAtc(e.target.value)} hint="For Form 2307" />
        </div>
        <dl className="space-y-1 self-end border border-border bg-row-alt p-3 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted">Net of VAT</dt>
            <dd className="tabular-nums">{money.format(net)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Input VAT</dt>
            <dd className="tabular-nums">{money.format(vatTotal)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Bill total</dt>
            <dd className="tabular-nums">{money.format(net + vatTotal)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Less EWT on payment</dt>
            <dd className="tabular-nums">−{money.format(ewt)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Cash to pay</dt>
            <dd className="tabular-nums">{money.format(net + vatTotal - ewt)}</dd>
          </div>
        </dl>
      </div>

      <TextAreaField name="note" label="Note" />
      <SubmitButton pendingText="Posting…">Post bill</SubmitButton>
    </ActionForm>
  );
}
