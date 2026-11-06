"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";

type ModulePermissions = { id: string; name: string; permissions: { key: string; label: string }[] };

export function RoleForm({
  action,
  modules,
  values,
  locked = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  modules: ModulePermissions[];
  values?: { name: string; description: string; permissions: string[] };
  locked?: boolean;
}) {
  const granted = new Set(values?.permissions);
  const all = granted.has("*");
  return (
    <ActionForm action={action}>
      <fieldset disabled={locked} className="space-y-4">
        {locked && <p className="text-muted">This is a system role. It always has every permission.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Role name" defaultValue={values?.name} required />
          <TextField name="description" label="Description" defaultValue={values?.description} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((m) => (
            <div key={m.id} className="space-y-2 rounded-md border border-border p-4">
              <p className="font-medium">{m.name}</p>
              {m.permissions.map((p) => (
                <CheckboxField
                  key={p.key}
                  name="permissions"
                  value={p.key}
                  label={p.label}
                  defaultChecked={all || granted.has(p.key)}
                />
              ))}
            </div>
          ))}
        </div>
        {!locked && <SubmitButton>Save role</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
