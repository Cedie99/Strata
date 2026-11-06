"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";

export type CustomerValues = {
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  termsDays: string;
  isActive: boolean;
};

export function CustomerForm({
  action,
  values,
  readOnly = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: CustomerValues;
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <TextField name="code" label="Code" defaultValue={values?.code} required />
          <TextField name="name" label="Name" defaultValue={values?.name} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="email" label="Email" type="email" defaultValue={values?.email} />
          <TextField name="phone" label="Phone" defaultValue={values?.phone} />
        </div>
        <TextAreaField name="address" label="Address" defaultValue={values?.address} />
        <TextField
          name="termsDays"
          label="Payment terms (days)"
          inputMode="numeric"
          defaultValue={values?.termsDays ?? "30"}
          hint="Invoices fall due this many days after the invoice date; 0 = due on delivery"
          required
        />
        <CheckboxField name="isActive" label="Active" defaultChecked={values?.isActive ?? true} />
        {!readOnly && <SubmitButton>Save customer</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
