"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/core/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FilePicker } from "@/components/ui/file-picker";
import { ActionForm, FieldErrors, SubmitButton } from "@/components/ui/form";

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadForm({ action }: { action: (state: ActionState, formData: FormData) => Promise<ActionState> }) {
  // React resets the form (and the picker with it) after each submission.
  const [picked, setPicked] = useState({ count: 0, tooLarge: false });
  return (
    <ActionForm action={action} className="max-w-3xl space-y-2">
      <FilePicker name="files" multiple maxBytes={MAX_BYTES} hint="Up to 10 files at a time, 10 MB each." onChange={setPicked} />
      <FieldErrors name="files" />
      <SubmitButton disabled={picked.count === 0 || picked.tooLarge}>
        {picked.count > 1 ? `Upload ${picked.count} files` : "Upload"}
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteFileButton({ action, fileName }: { action: () => Promise<ActionState>; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="tool" className="min-w-0! px-2!" aria-label={`Delete ${fileName}`} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this file?"
        items={[fileName]}
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
        The file is removed for good. The audit log records that it was deleted and by whom.
      </ConfirmDialog>
    </>
  );
}
