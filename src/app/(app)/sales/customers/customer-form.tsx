"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { VAT_CODES } from "@/core/tax";

export type CustomerValues = {
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  termsDays: string;
  tin: string;
  vatCode: string;
  cwtRate: string;
  cwtAtc: string;
  creditLimit: string;
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
        <TextAreaField name="address" label="Registered address" defaultValue={values?.address} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="tin" label="TIN" defaultValue={values?.tin} placeholder="123-456-789-00000" hint="Printed on the sales list (SLS) and SAWT" />
          <TextField
            name="termsDays"
            label="Payment terms (days)"
            inputMode="numeric"
            defaultValue={values?.termsDays ?? "30"}
            hint="Invoices fall due this many days after the invoice date; 0 = due on delivery"
            required
          />
        </div>
        <TextField
          name="creditLimit"
          label="Credit limit"
          inputMode="decimal"
          defaultValue={values?.creditLimit ?? "0"}
          hint="Most this customer may owe at once; 0 = no limit. An approval rule can hold invoices that go over it."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="vatCode"
            label="VAT on sales to them"
            options={[...VAT_CODES]}
            defaultValue={values?.vatCode ?? "VAT"}
            hint="Default for new invoice lines; zero-rated for e.g. PEZA or export sales"
          />
          <TextField
            name="cwtRate"
            label="They withhold (%)"
            inputMode="decimal"
            defaultValue={values?.cwtRate ?? "0"}
            hint="Tax the customer deducts from payments and covers with Form 2307, e.g. 1 for goods"
          />
          <TextField name="cwtAtc" label="Withholding ATC" defaultValue={values?.cwtAtc} placeholder="WC158" hint="As shown on their Form 2307" />
        </div>
        <CheckboxField name="isActive" label="Active" defaultChecked={values?.isActive ?? true} />
        {!readOnly && <SubmitButton>Save customer</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
