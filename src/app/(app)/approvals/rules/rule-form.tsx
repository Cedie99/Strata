"use client";

import { useState } from "react";
import { ConfirmSubmitButton } from "@/components/ui/confirm-dialog";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { ActionState } from "@/core/forms";
import { TRIGGERS } from "@/modules/approvals/module";

export type RuleValues = { name: string; trigger: string; threshold: string; isActive: boolean; levels: string[] };
type Option = { value: string; label: string };

/** Name, what starts the rule, the limit, and up to four approver roles in order. */
export function RuleForm({
  action,
  remove,
  values,
  roles,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  remove?: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: RuleValues;
  roles: Option[];
}) {
  const [trigger, setTrigger] = useState(values?.trigger ?? TRIGGERS[0].value);
  const t = TRIGGERS.find((x) => x.value === trigger)!;
  const roleOptions = (first: boolean) => [{ value: "", label: first ? "Choose a role…" : "None" }, ...roles];
  return (
    <div className="space-y-6">
      <ActionForm action={action}>
        <TextField name="name" label="Rule name" defaultValue={values?.name} placeholder="e.g. Large purchase orders" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="trigger"
            label="When"
            options={TRIGGERS.map((x) => ({ value: x.value, label: x.label }))}
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            hint={t.hint}
          />
          {t.unit === "none" ? (
            <input type="hidden" name="threshold" value="0" />
          ) : (
            <TextField
              name="threshold"
              label={t.unit === "percent" ? "More than (%)" : "From amount"}
              inputMode="decimal"
              defaultValue={values?.threshold ?? "0"}
              hint={t.unit === "percent" ? "e.g. 10 = discounts over 10%" : "0 = every one"}
            />
          )}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Who approves, in order</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <SelectField
                key={i}
                name={`level${i + 1}`}
                label={`Level ${i + 1}`}
                options={roleOptions(i === 0)}
                defaultValue={values?.levels[i] ?? ""}
                required={i === 0}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Anyone with the role can approve that level, except the person who asked and anyone who approved an earlier level.
          </p>
        </div>
        <CheckboxField name="isActive" label="Active" defaultChecked={values?.isActive ?? true} />
        <SubmitButton>Save rule</SubmitButton>
      </ActionForm>
      {remove && (
        <ActionForm action={remove}>
          <ConfirmSubmitButton label="Delete rule" title="Delete this rule?" items={[values?.name ?? ""]}>
            New documents stop needing this approval. Requests already waiting keep their steps.
          </ConfirmSubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
