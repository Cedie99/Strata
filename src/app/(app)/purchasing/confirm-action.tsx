"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ActionState } from "@/core/forms";

/** A button that asks for confirmation, then runs a bound server action (void, close, cancel). */
export function ConfirmAction({
  action,
  label,
  title,
  items,
  children,
}: {
  action: () => Promise<ActionState>;
  label: string;
  title: string;
  items?: string[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        items={items}
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
        {children}
      </ConfirmDialog>
    </>
  );
}
