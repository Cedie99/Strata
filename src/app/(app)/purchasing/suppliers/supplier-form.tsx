"use client";

import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import type { ActionState } from "@/core/forms";

export type SupplierValues = {
  code: string;
  name: string;
  tin: string;
  email: string;
  phone: string;
  address: string;
  termsDays: string;
  vatRegistered: boolean;
  ewtRate: string;
  isActive: boolean;
};

export function SupplierForm({
  action,
  values,
  readOnly = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: SupplierValues;
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <TextField name="code" label="Code" defaultValue={values?.code} required />
          <TextField name="name" label="Registered name" defaultValue={values?.name} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="tin" label="TIN" defaultValue={values?.tin} placeholder="123-456-789-00000" hint="Printed on Form 2307 and the purchases list" />
          <TextField name="email" label="Email" type="email" defaultValue={values?.email} />
          <TextField name="phone" label="Phone" defaultValue={values?.phone} />
        </div>
        <TextAreaField name="address" label="Registered address" defaultValue={values?.address} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="termsDays"
            label="Payment terms (days)"
            inputMode="numeric"
            defaultValue={values?.termsDays ?? "30"}
            hint="Bills fall due this many days after the bill date"
            required
          />
          <TextField
            name="ewtRate"
            label="Withholding (EWT) %"
            inputMode="decimal"
            defaultValue={values?.ewtRate ?? "0"}
            hint="Default for this supplier's bills: 1 goods, 2 services, 5 rent, 10/15 professionals"
            required
          />
        </div>
        <CheckboxField name="vatRegistered" label="VAT-registered (its invoices carry 12% input VAT)" defaultChecked={values?.vatRegistered ?? true} />
        <CheckboxField name="isActive" label="Active" defaultChecked={values?.isActive ?? true} />
        {!readOnly && <SubmitButton>Save supplier</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
