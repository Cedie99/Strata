"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";
import { sectionLabel } from "@/components/ui/layout";

export function UserForm({
  action,
  roles,
  branches,
  values,
  readOnly = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  roles: { id: string; name: string; description: string }[];
  branches: { id: string; code: string; name: string }[];
  values?: { name: string; email: string; isActive: boolean; roleIds: string[]; branchIds: string[] };
  readOnly?: boolean;
}) {
  const isNew = !values;
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Full name" defaultValue={values?.name} required />
          <TextField name="email" label="Email" type="email" defaultValue={values?.email} required />
        </div>
        {!readOnly && (
          <TextField
            name="password"
            label={isNew ? "Password" : "New password"}
            type="password"
            autoComplete="new-password"
            required={isNew}
            hint={isNew ? "At least 8 characters" : "Leave blank to keep the current password"}
          />
        )}
        {roles.length > 0 && (
          <div className="space-y-2">
            <p className={sectionLabel}>Roles</p>
            {roles.map((r) => (
              <CheckboxField
                key={r.id}
                name="roleIds"
                value={r.id}
                label={r.description ? `${r.name} · ${r.description}` : r.name}
                defaultChecked={values?.roleIds.includes(r.id)}
              />
            ))}
          </div>
        )}
        <div className="space-y-2">
          <p className={sectionLabel}>Branches</p>
          <p className="text-xs text-muted">
            The user only sees warehouses, stock and documents of these branches, unless a role lets them see all.
          </p>
          {branches.map((b) => (
            <CheckboxField
              key={b.id}
              name="branchIds"
              value={b.id}
              label={`${b.code} · ${b.name}`}
              defaultChecked={values ? values.branchIds.includes(b.id) : branches.length === 1}
            />
          ))}
        </div>
        <CheckboxField name="isActive" label="Active (can sign in)" defaultChecked={values?.isActive ?? true} />
        {!readOnly && <SubmitButton>Save user</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
