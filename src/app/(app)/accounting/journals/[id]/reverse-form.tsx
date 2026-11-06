"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";

export function ReverseForm({ action, today }: { action: (state: ActionState, formData: FormData) => Promise<ActionState>; today: string }) {
  return (
    <ActionForm action={action} className="space-y-3">
      <TextField name="date" label="Reversal date" type="date" defaultValue={today} hint="An open month; often the first day of the next month for accruals" required />
      <SubmitButton variant="secondary" pendingText="Reversing…">
        Post reversal
      </SubmitButton>
    </ActionForm>
  );
}
