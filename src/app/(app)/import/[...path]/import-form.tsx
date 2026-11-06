"use client";

import Link from "next/link";
import { useState } from "react";
import { FilePicker } from "@/components/ui/file-picker";
import type { ActionState } from "@/core/forms";
import { ActionForm, FieldErrors, SubmitButton } from "@/components/ui/form";

export function ImportForm({
  action,
  listHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  listHref: string;
}) {
  const [picked, setPicked] = useState({ count: 0, tooLarge: false });
  return (
    <ActionForm action={action}>
      <FilePicker
        name="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        maxBytes={10 * 1024 * 1024}
        hint="Excel .xlsx, up to 10 MB"
        onChange={setPicked}
      />
      <FieldErrors name="file" />
      <p className="text-xs text-muted">
        All rows are checked first. If any row has a problem, nothing is imported and every problem is listed here.
      </p>
      <SubmitButton disabled={picked.count === 0 || picked.tooLarge}>Import</SubmitButton>
      <FieldErrors name="rows" />
      <p>
        <Link href={listHref} className="text-primary hover:underline">
          ← Back to the list
        </Link>
      </p>
    </ActionForm>
  );
}
