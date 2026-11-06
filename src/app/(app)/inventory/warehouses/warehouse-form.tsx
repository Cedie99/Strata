"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";

export function WarehouseForm({
  action,
  branches,
  values,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  branches: { id: string; code: string; name: string }[];
  values?: { code: string; name: string; address: string; branchId: string; isActive: boolean };
}) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField name="code" label="Code" defaultValue={values?.code} required />
        <TextField name="name" label="Name" defaultValue={values?.name} required />
      </div>
      <SelectField
        name="branchId"
        label="Branch"
        defaultValue={values?.branchId ?? (branches.length === 1 ? branches[0].id : "")}
        options={[{ value: "", label: "Choose…" }, ...branches.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))]}
        required
      />
      <TextAreaField name="address" label="Address" defaultValue={values?.address} />
      <CheckboxField name="isActive" label="Active" defaultChecked={values?.isActive ?? true} />
      <SubmitButton>Save warehouse</SubmitButton>
    </ActionForm>
  );
}
