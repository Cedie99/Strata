"use client";

import { useState } from "react";
import type { ActionState } from "@/core/forms";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";

type Values = { prefix: string; padding: number; perBranch: boolean; yearly: boolean };

export function SeriesForm({
  action,
  values,
  branchless,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values: Values;
  branchless: boolean;
}) {
  const [v, setV] = useState(values);
  const example = [
    v.prefix.toUpperCase() || "…",
    !branchless && v.perBranch && "MNL",
    v.yearly && new Date().getFullYear(),
    "1".padStart(Math.min(Math.max(v.padding || 0, 1), 10), "0"),
  ]
    .filter(Boolean)
    .join("-");

  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="prefix"
          label="Prefix"
          value={v.prefix}
          onChange={(e) => setV({ ...v, prefix: e.target.value })}
          maxLength={10}
          required
        />
        <TextField
          name="padding"
          label="Digits"
          type="number"
          min={3}
          max={10}
          value={v.padding}
          onChange={(e) => setV({ ...v, padding: Number(e.target.value) })}
          required
        />
      </div>
      {!branchless && (
        <CheckboxField
          name="perBranch"
          label="Separate numbers per branch (adds the branch code)"
          checked={v.perBranch}
          onChange={(e) => setV({ ...v, perBranch: e.target.checked })}
        />
      )}
      <CheckboxField
        name="yearly"
        label="Restart every year (adds the year)"
        checked={v.yearly}
        onChange={(e) => setV({ ...v, yearly: e.target.checked })}
      />
      <p>
        Next documents will look like <span className="font-mono font-semibold">{example}</span>
      </p>
      <SubmitButton>Save numbering</SubmitButton>
    </ActionForm>
  );
}
