"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import type { ActionState } from "@/core/forms";

/** Approve (reason optional) or reject (reason required) the step waiting for this user. */
export function DecisionPanel({
  approve,
  reject,
  last,
}: {
  approve: (state: ActionState, formData: FormData) => Promise<ActionState>;
  reject: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** The last step: approving posts the document. */
  last: boolean;
}) {
  return (
    <div className="space-y-4">
      <ActionForm action={approve} className="space-y-2">
        <TextField name="reason" label="Note (optional)" />
        <SubmitButton pendingText={last ? "Approving and posting…" : "Approving…"}>{last ? "Approve and post" : "Approve"}</SubmitButton>
        {last && <p className="text-xs text-muted">This is the last step: approving posts the document now.</p>}
      </ActionForm>
      <ActionForm action={reject} className="space-y-2 border-t border-border pt-3">
        <TextField name="reason" label="Reason for rejecting" hint="Required; the requester sees it" />
        <SubmitButton variant="danger" pendingText="Rejecting…">
          Reject
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

/** The requester takes the request back while it is still waiting. */
export function WithdrawButton({ action, number }: { action: () => Promise<ActionState>; number: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Withdraw request
      </Button>
      <ConfirmDialog
        open={open}
        title="Withdraw this request?"
        items={[number]}
        confirmLabel="Withdraw"
        pending={pending}
        error={error}
        onCancel={() => {
          setOpen(false);
          setError(undefined);
        }}
        onConfirm={() =>
          startTransition(async () => {
            const result = await action();
            if (result?.error) setError(result.error);
            else setOpen(false);
          })
        }
      >
        Nothing is posted. The request stays in the history as withdrawn.
      </ConfirmDialog>
    </>
  );
}
