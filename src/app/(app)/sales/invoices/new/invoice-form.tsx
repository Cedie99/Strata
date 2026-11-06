"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm, FieldErrors, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { tableClass } from "@/components/ui/layout";
import { saveInvoice } from "@/modules/sales/actions";

type Option = { value: string; label: string };
export type ProductOption = Option & { price: string; cost: string; unit: string };
type Line = { key: number; productId: string; qty: string; unitPrice: string };

const toNumber = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function InvoiceForm({
  customers,
  warehouses,
  products,
  customerId,
  today,
  currency,
}: {
  customers: Option[];
  warehouses: Option[];
  products: ProductOption[];
  customerId?: string;
  today: string;
  currency: string;
}) {
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qty: "", unitPrice: "" }]);
  const productById = new Map(products.map((p) => [p.value, p]));
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency });

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: number, productId: string) => update(key, { productId, unitPrice: productById.get(productId)?.price ?? "" });

  const total = lines.reduce((s, l) => s + toNumber(l.qty) * toNumber(l.unitPrice), 0);
  const cost = lines.reduce((s, l) => s + toNumber(l.qty) * toNumber(productById.get(l.productId)?.cost ?? "0"), 0);
  const payload = JSON.stringify(lines.filter((l) => l.productId || l.qty).map(({ productId, qty, unitPrice }) => ({ productId, qty, unitPrice })));
  const placeholder = (label: string) => [{ value: "", label }];

  return (
    <ActionForm action={saveInvoice}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="customerId" label="Customer" options={[...placeholder("Choose a customer…"), ...customers]} defaultValue={customerId ?? ""} required />
        <SelectField
          name="warehouseId"
          label="Ship from warehouse"
          options={[...placeholder("Choose…"), ...warehouses]}
          defaultValue={warehouses.length === 1 ? warehouses[0].value : ""}
          hint="Stock is issued from here; the invoice belongs to its branch"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="date" label="Invoice date" type="date" defaultValue={today} required />
        <TextField name="dueDate" label="Due date" type="date" hint="Blank = from the customer's terms" />
        <TextField name="reference" label="Reference" hint="e.g. customer PO, DR number" />
      </div>

      <div>
        <p className="mb-1 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
          Lines<span className="ml-0.5 text-danger">*</span>
        </p>
        <div className="overflow-x-auto border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className="w-[45%]">Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit price</th>
                <th className="text-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = productById.get(l.productId);
                return (
                  <tr key={l.key}>
                    <td>
                      <select
                        aria-label="Product"
                        className="w-full rounded-sm border border-border px-1.5 py-1"
                        value={l.productId}
                        onChange={(e) => pick(l.key, e.target.value)}
                      >
                        <option value="">Choose a product…</option>
                        {products.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">
                      <input
                        aria-label="Quantity"
                        inputMode="decimal"
                        className="w-24 rounded-sm border border-border px-1.5 py-1 text-right"
                        value={l.qty}
                        onChange={(e) => update(l.key, { qty: e.target.value })}
                      />
                      {p && <span className="ml-1 text-muted">{p.unit}</span>}
                    </td>
                    <td className="text-right">
                      <input
                        aria-label="Unit price"
                        inputMode="decimal"
                        className="w-28 rounded-sm border border-border px-1.5 py-1 text-right"
                        value={l.unitPrice}
                        onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                      />
                    </td>
                    <td className="text-right tabular-nums">{money.format(toNumber(l.qty) * toNumber(l.unitPrice))}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="px-1 text-muted hover:text-danger disabled:opacity-30"
                        disabled={lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td colSpan={3} className="text-right">
                  Total
                </td>
                <td className="text-right tabular-nums">{money.format(total)}</td>
                <td />
              </tr>
              {total > 0 && (
                <tr className="text-muted">
                  <td colSpan={3} className="text-right">
                    Estimated gross profit (at current product cost)
                  </td>
                  <td className={`text-right tabular-nums ${total - cost < 0 ? "text-danger" : ""}`}>
                    {money.format(total - cost)} · {(((total - cost) / total) * 100).toFixed(1)}%
                  </td>
                  <td />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, productId: "", qty: "", unitPrice: "" }])}
        >
          + Add line
        </Button>
        <input type="hidden" name="lines" value={payload} />
        <div className="mt-2">
          <FieldErrors name="lines" />
        </div>
      </div>

      <TextAreaField name="note" label="Note" />
      <SubmitButton pendingText="Posting…">Post invoice</SubmitButton>
      <p className="text-xs text-muted">Posting issues the stock and cannot be edited afterwards; void the invoice to reverse it.</p>
    </ActionForm>
  );
}
