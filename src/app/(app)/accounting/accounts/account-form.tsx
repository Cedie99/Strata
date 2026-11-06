"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { ACCOUNT_TYPES } from "@/modules/accounting/module";

export type AccountValues = { code: string; name: string; type: string; isActive: boolean };

export function AccountForm({
  action,
  values,
  readOnly = false,
  lockType = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: AccountValues;
  readOnly?: boolean;
  /** System accounts and accounts with entries keep their type. */
  lockType?: boolean;
}) {
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <TextField
            name="code"
            label="Code"
            inputMode="numeric"
            defaultValue={values?.code}
            hint="1 assets · 2 liabilities · 3 equity · 40–48 revenue · 49 other income · 5 cost of sales · 6–9 expenses"
            required
          />
          <TextField name="name" label="Name" defaultValue={values?.name} required />
        </div>
        {lockType && <input type="hidden" name="type" value={values?.type} />}
        <SelectField
          name={lockType ? "typeShown" : "type"}
          label="Type"
          options={[...ACCOUNT_TYPES]}
          defaultValue={values?.type ?? "EXPENSE"}
          disabled={lockType}
          hint={lockType ? "Fixed: the account is used by automatic postings or already has entries" : undefined}
        />
        <CheckboxField name="isActive" label="Active (inactive accounts take no new postings)" defaultChecked={values?.isActive ?? true} />
        {!readOnly && <SubmitButton>Save account</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
