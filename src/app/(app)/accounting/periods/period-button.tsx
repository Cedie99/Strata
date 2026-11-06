"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ActionState } from "@/core/forms";

export function PeriodButton({ action, label, month, closing }: { action: () => Promise<ActionState>; label: string; month: string; closing: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant={closing ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={closing ? `Close ${month}?` : `Reopen ${month}?`}
        confirmLabel={label}
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
        {closing
          ? "Nothing dated in this month can be posted, voided or corrected afterwards, in any module. Do this once the month's figures are checked and reported."
          : "Postings dated in this month become possible again, which can change reports already filed. The reopening is recorded in the audit log."}
      </ConfirmDialog>
    </>
  );
}
