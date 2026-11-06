"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";

export function BranchForm({
  action,
  values,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: { code: string; name: string; address: string; isActive: boolean };
}) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField
          name={values ? "code_locked" : "code"}
          label="Code"
          defaultValue={values?.code}
          readOnly={!!values}
          maxLength={10}
          hint={values ? "Fixed: used in document numbers" : "e.g. MNL, CEB, ILO"}
          required
        />
        <TextField name="name" label="Name" defaultValue={values?.name} required />
      </div>
      <TextAreaField name="address" label="Address" defaultValue={values?.address} />
      <CheckboxField name="isActive" label="Active" defaultChecked={values?.isActive ?? true} />
      <SubmitButton>Save branch</SubmitButton>
    </ActionForm>
  );
}
