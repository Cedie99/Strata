"use client";

import { useState } from "react";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { saveCashEntry } from "@/modules/finance/actions";

type Option = { value: string; label: string };

export function CashForm({ branches, categories, today }: { branches: Option[]; categories: { IN: readonly string[]; OUT: readonly string[] }; today: string }) {
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  return (
    <ActionForm action={saveCashEntry}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="direction"
          label="Direction"
          options={[
            { value: "OUT", label: "Cash out (paid)" },
            { value: "IN", label: "Cash in (received)" },
          ]}
          value={direction}
          onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}
        />
        <SelectField
          key={direction}
          name="category"
          label="Category"
          options={[{ value: "", label: "Choose…" }, ...categories[direction].map((c) => ({ value: c, label: c }))]}
          defaultValue=""
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="branchId"
          label="Branch"
          options={[{ value: "", label: "Choose…" }, ...branches]}
          defaultValue={branches.length === 1 ? branches[0].value : ""}
          required
        />
        <TextField name="date" label="Date" type="date" defaultValue={today} required />
        <TextField name="amount" label="Amount" inputMode="decimal" required />
      </div>
      <TextField name="reference" label="Reference" hint="e.g. OR/receipt number, check number, supplier invoice" />
      <TextAreaField name="note" label="Description" />
      <p className="text-xs text-muted">Customer payments are recorded on their invoice under Sales, not here.</p>
      <SubmitButton>Record entry</SubmitButton>
    </ActionForm>
  );
}
