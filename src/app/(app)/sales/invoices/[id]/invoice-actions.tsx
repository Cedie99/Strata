"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { ActionState } from "@/core/forms";
import { savePayment } from "@/modules/sales/actions";
import { PAYMENT_METHODS } from "@/modules/sales/module";

export function VoidInvoiceButton({ action, number }: { action: () => Promise<ActionState>; number: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Void invoice
      </Button>
      <ConfirmDialog
        open={open}
        title="Void this invoice?"
        items={[number]}
        confirmLabel="Void invoice"
        pending={pending}
        error={error}
        onCancel={() => {
          setOpen(false);
          setError(undefined);
        }}
        onConfirm={() =>
          startTransition(async () => {
            const result = await action();
            if (result?.error) setError(result.error);
            else setOpen(false);
          })
        }
      >
        The stock is received back into the warehouse and the invoice stops counting as revenue and receivable. The number is kept and
        cannot be reused.
      </ConfirmDialog>
    </>
  );
}

/**
 * Amount = what the invoice is reduced by. If the customer withholds tax (and gives Form 2307), part of
 * it is not cash: the tax withheld is suggested from the customer's rate on the net-of-VAT share and can be changed.
 */
export function PaymentForm({
  invoiceId,
  outstanding,
  today,
  subtotal,
  total,
  cwtRate,
  atc,
}: {
  invoiceId: string;
  outstanding: string;
  today: string;
  subtotal: number;
  total: number;
  cwtRate: number;
  atc: string;
}) {
  const [amount, setAmount] = useState(outstanding);
  const [cwt, setCwt] = useState<string | null>(null); // null = follow the suggestion
  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const suggested = total > 0 ? Math.round(((n(amount) * subtotal) / total) * cwtRate) / 100 : 0;
  const withheld = cwt ?? suggested.toFixed(2);
  const cash = n(amount) - n(withheld);
  return (
    <ActionForm action={savePayment} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="amount" label="Amount applied" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <TextField name="date" label="Date received" type="date" defaultValue={today} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          name="cwt"
          label="Tax withheld (2307)"
          inputMode="decimal"
          value={withheld}
          onChange={(e) => setCwt(e.target.value)}
          hint={cwtRate > 0 ? `Suggested: ${cwtRate}% of the net of VAT` : "If the customer deducted tax"}
        />
        <TextField name="atc" label="ATC" defaultValue={atc} placeholder="WC158" />
      </div>
      <p className="text-xs text-muted">
        Cash received: <b className="text-text tabular-nums">{cash.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField name="method" label="Method" options={[...PAYMENT_METHODS]} defaultValue="CASH" />
        <TextField name="reference" label="Reference" hint="Check or transfer no." />
      </div>
      <SubmitButton>Record payment</SubmitButton>
    </ActionForm>
  );
}
