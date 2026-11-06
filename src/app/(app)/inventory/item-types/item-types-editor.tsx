"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { DataTable, EmptyRow } from "@/components/ui/layout";
import type { ActionState } from "@/core/forms";
import type { ItemTypeRow } from "@/modules/inventory/queries";

const inputClass =
  "w-full rounded-sm border border-border px-2 py-1 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:bg-row-alt";

/** Item types edited in place: rename, (de)activate, reorder, delete unused, and add new ones at the bottom. */
export function ItemTypesEditor({
  types,
  canManage,
  save,
  move,
  remove,
}: {
  types: ItemTypeRow[];
  canManage: boolean;
  save: (id: string | null, state: ActionState, formData: FormData) => Promise<ActionState>;
  move: (id: string, direction: -1 | 1) => Promise<ActionState>;
  remove: (id: string) => Promise<ActionState>;
}) {
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<ItemTypeRow | null>(null);
  const [error, setError] = useState<string>();

  return (
    <div className="max-w-4xl space-y-3 px-1">
      <DataTable>
        <thead>
          <tr>
            <th className="w-16">Order</th>
            <th>Name</th>
            <th className="w-20">Active</th>
            <th className="w-20 text-right!">Classes</th>
            <th>Modified</th>
            {canManage && <th className="w-48" />}
          </tr>
        </thead>
        <tbody>
          {types.length === 0 && <EmptyRow colSpan={6}>No item types yet. Add the first one below.</EmptyRow>}
          {types.map((t, i) => (
            <tr key={t.id}>
              <td>
                {canManage && (
                  <span className="flex gap-0.5">
                    <button
                      type="button"
                      className="px-1 text-muted hover:text-text disabled:opacity-30"
                      aria-label={`Move ${t.name} up`}
                      disabled={i === 0 || pending}
                      onClick={() => startTransition(async () => void (await move(t.id, -1)))}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="px-1 text-muted hover:text-text disabled:opacity-30"
                      aria-label={`Move ${t.name} down`}
                      disabled={i === types.length - 1 || pending}
                      onClick={() => startTransition(async () => void (await move(t.id, 1)))}
                    >
                      ▼
                    </button>
                  </span>
                )}
              </td>
              <td>
                {canManage ? (
                  <ActionForm action={save.bind(null, t.id)} className="flex items-center gap-2">
                    <input name="name" defaultValue={t.name} aria-label="Name" className={inputClass} maxLength={60} required />
                    <input type="hidden" name="isActive" value={t.isActive ? "on" : ""} />
                    <SubmitButton variant="secondary" pendingText="…">
                      Rename
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <span className={t.isActive ? "font-medium" : "text-muted line-through"}>{t.name}</span>
                )}
              </td>
              <td>
                {canManage ? (
                  <ActionForm action={save.bind(null, t.id)} className="contents">
                    <input type="hidden" name="name" value={t.name} />
                    {!t.isActive && <input type="hidden" name="isActive" value="on" />}
                    <button
                      className={`rounded-full px-2 py-px text-[11px] font-semibold ring-1 ring-inset ${t.isActive ? "bg-ok/10 text-ok ring-ok/30" : "bg-muted/10 text-muted ring-muted/30"}`}
                      title={t.isActive ? "Click to retire it (kept on existing records, hidden from new choices)" : "Click to use it again"}
                    >
                      {t.isActive ? "Active" : "Retired"}
                    </button>
                  </ActionForm>
                ) : t.isActive ? (
                  "Yes"
                ) : (
                  "No"
                )}
              </td>
              <td className="text-right">{t.classCount}</td>
              <td className="text-muted">
                {t.modifiedBy || "—"} · {t.modifiedAt}
              </td>
              {canManage && (
                <td className="text-right">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={t.classCount > 0 || pending}
                    title={t.classCount > 0 ? "It has classes: retire it instead" : undefined}
                    onClick={() => {
                      setError(undefined);
                      setDeleting(t);
                    }}
                  >
                    Delete
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>

      {canManage && (
        <ActionForm action={save.bind(null, null)} className="flex max-w-xl items-end gap-2">
          <label className="flex-1 space-y-1">
            <span className="block text-[11px] font-bold tracking-[0.06em] text-muted uppercase">New item type</span>
            <input name="name" placeholder="e.g. Spare Parts" className={inputClass} maxLength={60} required />
          </label>
          <input type="hidden" name="isActive" value="on" />
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete this item type?"
        items={deleting ? [deleting.name] : []}
        pending={pending}
        error={error}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          startTransition(async () => {
            const result = await remove(deleting.id);
            if (result?.error) setError(result.error);
            else setDeleting(null);
          })
        }
      >
        Records that chose it would show &quot;(removed)&quot;. Retire it instead to keep it on existing records.
      </ConfirmDialog>
    </div>
  );
}
