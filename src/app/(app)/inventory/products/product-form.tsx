"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";

export type ProductValues = {
  sku: string;
  name: string;
  description: string;
  unit: string;
  cost: string;
  price: string;
  reorderLevel: string;
  isActive: boolean;
};

export function ProductForm({
  action,
  values,
  readOnly = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: ProductValues;
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="sku" label="SKU" defaultValue={values?.sku} required />
          <TextField name="unit" label="Unit" defaultValue={values?.unit ?? "pc"} hint="e.g. pc, L, kg, box" required />
        </div>
        <TextField name="name" label="Name" defaultValue={values?.name} required />
        <TextAreaField name="description" label="Description" defaultValue={values?.description} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="cost" label="Cost" inputMode="decimal" defaultValue={values?.cost ?? "0"} required />
          <TextField name="price" label="Selling price" inputMode="decimal" defaultValue={values?.price ?? "0"} required />
          <TextField
            name="reorderLevel"
            label="Reorder level"
            inputMode="decimal"
            defaultValue={values?.reorderLevel ?? "0"}
            hint="Flag as low stock at or below this"
            required
          />
        </div>
        <CheckboxField name="isActive" label="Active" defaultChecked={values?.isActive ?? true} />
        {!readOnly && <SubmitButton>Save product</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
