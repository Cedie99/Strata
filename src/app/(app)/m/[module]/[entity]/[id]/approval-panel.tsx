"use client";

import type { ActionState } from "@/core/forms";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card } from "@/components/ui/layout";

const TONES: Record<string, string> = {
  PENDING: "border-accent bg-accent/10",
  APPROVED: "border-ok/40 bg-ok/10",
  REJECTED: "border-danger/40 bg-danger/10",
};

/** Where a record is in its approval, and Approve / Reject for approvers while it is pending. */
export function ApprovalPanel({
  status,
  label,
  decided,
  note,
  approve,
  reject,
}: {
  status: string;
  label: string;
  /** "by Ana Cruz on 30 Oct 2026, 3:15 pm", when decided. */
  decided?: string;
  note: string;
  /** Present only for users who may decide on this record now. */
  approve?: (state: ActionState, formData: FormData) => Promise<ActionState>;
  reject?: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  return (
    <Card title="Approval">
      <div className="space-y-3">
        <p className={`border-l-4 px-3 py-2 ${TONES[status] ?? ""}`}>
          <span className="font-semibold">{label}</span>
          {decided && <span className="text-muted"> {decided}</span>}
          {note && <span className="mt-1 block">&ldquo;{note}&rdquo;</span>}
          {status === "PENDING" && !approve && (
            <span className="mt-1 block text-[13px] text-muted">
              Waiting for someone with &ldquo;Approve records&rdquo; permission, other than the person who last saved it.
            </span>
          )}
        </p>
        {approve && reject && (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
            <ActionForm action={approve}>
              <SubmitButton pendingText="Approving…">Approve</SubmitButton>
            </ActionForm>
            <ActionForm action={reject} className="flex items-end gap-2">
              <div className="flex-1">
                <TextField name="note" label="Reason for rejecting" maxLength={500} placeholder="e.g. Price is below cost" />
              </div>
              <SubmitButton variant="danger" pendingText="Rejecting…">
                Reject
              </SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </Card>
  );
}
