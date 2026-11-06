"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm, FieldErrors, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { tableClass } from "@/components/ui/layout";
import { saveOrder } from "@/modules/purchasing/actions";
import { VAT_CODES, VAT_RATE } from "@/modules/purchasing/module";

type Option = { value: string; label: string };
type SupplierOption = Option & { vatRegistered: boolean };
type ProductOption = Option & { cost: string; unit: string };
type Line = { key: number; productId: string; qty: string; unitCost: string; vatCode: string };

const toNumber = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
const cell = "w-full rounded-sm border border-border px-1.5 py-1";

export function OrderForm({
  suppliers,
  warehouses,
  products,
  supplierId,
  today,
  currency,
}: {
  suppliers: SupplierOption[];
  warehouses: Option[];
  products: ProductOption[];
  supplierId?: string;
  today: string;
  currency: string;
}) {
  const [supplier, setSupplier] = useState(supplierId ?? "");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qty: "", unitCost: "", vatCode: "VAT" }]);
  const productById = new Map(products.map((p) => [p.value, p]));
  const vatRegistered = suppliers.find((s) => s.value === supplier)?.vatRegistered ?? true;
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency });

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const net = (l: Line) => round2(toNumber(l.qty) * toNumber(l.unitCost));
  const vatOf = (l: Line) => (vatRegistered && l.vatCode === "VAT" ? round2(net(l) * VAT_RATE) : 0);
  const subtotal = lines.reduce((s, l) => s + net(l), 0);
  const vat = lines.reduce((s, l) => s + vatOf(l), 0);
  const payload = JSON.stringify(lines.filter((l) => l.productId || l.qty).map(({ productId, qty, unitCost, vatCode }) => ({ productId, qty, unitCost, vatCode })));

  return (
    <ActionForm action={saveOrder}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="supplierId"
          label="Supplier"
          options={[{ value: "", label: "Choose a supplier…" }, ...suppliers]}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          hint={supplier && !vatRegistered ? "Non-VAT supplier: no input VAT on this order" : undefined}
          required
        />
        <SelectField
          name="warehouseId"
          label="Deliver to warehouse"
          options={[{ value: "", label: "Choose…" }, ...warehouses]}
          defaultValue={warehouses.length === 1 ? warehouses[0].value : ""}
          hint="Goods are received here; the order belongs to its branch"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="date" label="PO date" type="date" defaultValue={today} required />
        <TextField name="expectedDate" label="Expected delivery" type="date" />
        <TextField name="reference" label="Reference" hint="e.g. supplier quotation no." />
      </div>

      <div>
        <p className="mb-1 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
          Lines<span className="ml-0.5 text-danger">*</span>
          <span className="ml-2 font-normal tracking-normal normal-case">Unit cost is net of VAT.</span>
        </p>
        <div className="overflow-x-auto border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className="w-[38%]">Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit cost</th>
                <th>VAT</th>
                <th className="text-right">Net</th>
                <th className="text-right">VAT amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = productById.get(l.productId);
                return (
                  <tr key={l.key}>
                    <td>
                      <select aria-label="Product" className={cell} value={l.productId} onChange={(e) => update(l.key, { productId: e.target.value, unitCost: productById.get(e.target.value)?.cost ?? "" })}>
                        <option value="">Choose a product…</option>
                        {products.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <input aria-label="Quantity" inputMode="decimal" className="w-20 rounded-sm border border-border px-1.5 py-1 text-right" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                      {p && <span className="ml-1 text-muted">{p.unit}</span>}
                    </td>
                    <td className="text-right">
                      <input aria-label="Unit cost" inputMode="decimal" className="w-24 rounded-sm border border-border px-1.5 py-1 text-right" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: e.target.value })} />
                    </td>
                    <td>
                      <select aria-label="VAT" className={cell} value={vatRegistered ? l.vatCode : "EXEMPT"} disabled={!vatRegistered} onChange={(e) => update(l.key, { vatCode: e.target.value })}>
                        {VAT_CODES.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right tabular-nums">{money.format(net(l))}</td>
                    <td className="text-right text-muted tabular-nums">{money.format(vatOf(l))}</td>
                    <td className="text-right">
                      <button type="button" className="px-1 text-muted hover:text-danger disabled:opacity-30" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={4} className="text-right text-muted">Net of VAT</td>
                <td className="text-right tabular-nums">{money.format(subtotal)}</td>
                <td className="text-right text-muted tabular-nums">{money.format(vat)}</td>
                <td />
              </tr>
              <tr className="font-semibold">
                <td colSpan={4} className="text-right">Total</td>
                <td colSpan={2} className="text-right tabular-nums">{money.format(subtotal + vat)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <Button type="button" variant="secondary" className="mt-2" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, productId: "", qty: "", unitCost: "", vatCode: "VAT" }])}>
          + Add line
        </Button>
        <input type="hidden" name="lines" value={payload} />
        <div className="mt-2">
          <FieldErrors name="lines" />
        </div>
      </div>

      <TextAreaField name="note" label="Note" hint="Delivery instructions, terms…" />
      <SubmitButton pendingText="Saving…">Create purchase order</SubmitButton>
    </ActionForm>
  );
}
