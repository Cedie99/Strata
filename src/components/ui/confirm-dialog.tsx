"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/**
 * A confirmation window for destructive actions (the browser's confirm() is plain and easy to click past).
 * Built on <dialog>: it is modal, keeps keyboard focus inside, and Esc or a click outside cancels.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  items = [],
  confirmLabel = "Delete",
  pending = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  /** Names of what will be affected, listed so the user can check them. */
  items?: string[];
  confirmLabel?: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const shown = items.slice(0, 8);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(e) => {
        // A click on the dimmed backdrop (the dialog element itself, outside the panel) cancels.
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] border-0 bg-transparent p-0 text-text backdrop:bg-black/50 backdrop:backdrop-blur-[1px]"
    >
      <div className="border-t-[3px] border-danger bg-surface shadow-2xl" role="alertdialog" aria-labelledby="confirm-title">
        <div className="flex gap-3 px-5 pt-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger" aria-hidden>
            <svg viewBox="0 0 20 20" className="size-5 fill-current">
              <path d="M10 2.5c.6 0 1.1.3 1.4.8l6.6 11.5c.6 1-.2 2.2-1.4 2.2H3.4c-1.2 0-2-1.2-1.4-2.2L8.6 3.3c.3-.5.8-.8 1.4-.8Zm0 4.3a.9.9 0 0 0-.9.9v3.8a.9.9 0 0 0 1.8 0V7.7a.9.9 0 0 0-.9-.9Zm0 7a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-[16px] font-semibold">
              {title}
            </h2>
            {shown.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto border border-border bg-row-alt px-3 py-2 text-[13px]">
                {shown.map((name, i) => (
                  <li key={`${name}-${i}`} className="truncate font-semibold" title={name}>
                    {name}
                  </li>
                ))}
                {items.length > shown.length && (
                  <li className="text-muted">…and {items.length - shown.length} more</li>
                )}
              </ul>
            )}
            {children && <div className="mt-2 text-[13px] text-muted">{children}</div>}
            {error && (
              <p role="alert" className="mt-3 border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-border bg-row-alt px-5 py-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * A red button for use inside a form whose action deletes something: it opens ConfirmDialog first and
 * submits the form only after the user confirms. Errors from the action show in the form as usual.
 */
export function ConfirmSubmitButton({
  label,
  title,
  items,
  children,
}: {
  label: string;
  title: string;
  items?: string[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={buttonRef} type="button" variant="danger" disabled={pending} onClick={() => setOpen(true)}>
        {pending ? "Deleting…" : label}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        items={items}
        confirmLabel={label}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          buttonRef.current?.form?.requestSubmit();
        }}
      >
        {children}
      </ConfirmDialog>
    </>
  );
}
