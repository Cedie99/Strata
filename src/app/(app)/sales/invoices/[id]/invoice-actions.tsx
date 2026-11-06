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

export function PaymentForm({ invoiceId, outstanding, today }: { invoiceId: string; outstanding: string; today: string }) {
  return (
    <ActionForm action={savePayment} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="amount" label="Amount" inputMode="decimal" defaultValue={outstanding} required />
        <TextField name="date" label="Date received" type="date" defaultValue={today} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField name="method" label="Method" options={[...PAYMENT_METHODS]} defaultValue="CASH" />
        <TextField name="reference" label="Reference" hint="Check or transfer no." />
      </div>
      <SubmitButton>Record payment</SubmitButton>
    </ActionForm>
  );
}
