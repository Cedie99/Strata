"use client";

import { useState } from "react";
import { ActionForm, FieldErrors, SubmitButton, TextField } from "@/components/ui/form";
import { tableClass } from "@/components/ui/layout";
import { saveReceipt } from "@/modules/purchasing/actions";

export type ReceivableLine = { id: string; product: string; unit: string; ordered: string; received: string; remaining: string };

/** Quantities that arrived now; each defaults to everything still to come. */
export function ReceiveForm({ orderId, lines }: { orderId: string; lines: ReceivableLine[] }) {
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, l.remaining])));
  const payload = JSON.stringify(
    lines.filter((l) => Number(qty[l.id]) > 0).map((l) => ({ orderLineId: l.id, qty: qty[l.id].trim() })),
  );
  return (
    <ActionForm action={saveReceipt}>
      <input type="hidden" name="orderId" value={orderId} />
      <div className="overflow-x-auto border border-border">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Product</th>
              <th className="text-right">Ordered</th>
              <th className="text-right">Received so far</th>
              <th className="text-right">Receive now</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.product}</td>
                <td className="text-right tabular-nums">{l.ordered}</td>
                <td className="text-right text-muted tabular-nums">{l.received}</td>
                <td className="text-right whitespace-nowrap">
                  <input
                    aria-label={`Receive now: ${l.product}`}
                    inputMode="decimal"
                    className="w-24 rounded-sm border border-border px-1.5 py-1 text-right"
                    value={qty[l.id]}
                    onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                  />
                  <span className="ml-1 text-muted">{l.unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <input type="hidden" name="lines" value={payload} />
      <FieldErrors name="lines" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="reference" label="Supplier delivery receipt no." />
        <TextField name="note" label="Note" hint="e.g. damaged items, short delivery" />
      </div>
      <SubmitButton pendingText="Receiving…">Receive goods</SubmitButton>
      <p className="text-xs text-muted">
        Receiving adds the stock today at the PO cost and updates each product&apos;s average cost. Leave a line at 0 if it did not arrive.
      </p>
    </ActionForm>
  );
}
