"use client";

import { createContext, useActionState, useContext, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/core/forms";
import { Button } from "./button";

const FormStateContext = createContext<ActionState>(undefined);

/** A form bound to a server action that returns ActionState; shows errors and success messages. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <FormStateContext.Provider value={state}>
      <form action={formAction} className={className}>
        {state?.error && (
          <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-semibold text-danger">{state.error}</p>
        )}
        {state?.ok && <p className="rounded-sm border border-ok/40 bg-ok/10 px-3 py-2 font-semibold text-ok">{state.ok}</p>}
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

// Values are the most important text in a form: full contrast, slightly larger than labels.
// Read-only and disabled values sit on a tinted background so it is clear they cannot be changed.
const inputClass =
  "w-full rounded-sm border border-border px-2 py-1.5 text-[13.5px] font-medium outline-none placeholder:font-normal placeholder:text-muted/70 focus:border-primary focus:ring-1 focus:ring-primary/30 read-only:bg-row-alt disabled:bg-row-alt disabled:text-text aria-invalid:border-danger";

/** Label above the value: small, quiet capitals so the eye goes to the values; red * marks required fields. */
function FieldShell({
  name,
  label,
  hint,
  required,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const errors = useContext(FormStateContext)?.fieldErrors?.[name];
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && !errors && <span className="block text-xs text-muted">{hint}</span>}
      {errors?.map((e) => (
        <span key={e} className="block text-xs font-semibold text-danger">
          {e}
        </span>
      ))}
    </label>
  );
}

const useInvalid = (name: string) => !!useContext(FormStateContext)?.fieldErrors?.[name]?.length;

/** Names of the fields the last submit of the surrounding ActionForm flagged, e.g. to mark the tab they are on. */
export function useFieldErrorNames() {
  const errors = useContext(FormStateContext)?.fieldErrors ?? {};
  return new Set(Object.keys(errors).filter((k) => errors[k]?.length));
}

/** Errors for a form value that has no regular field, e.g. a hidden JSON input. */
export function FieldErrors({ name }: { name: string }) {
  const errors = useContext(FormStateContext)?.fieldErrors?.[name];
  if (!errors?.length) return null;
  return (
    <ul className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

type FieldProps = { name: string; label: string; hint?: string };

export function TextField({ label, hint, name, ...props }: ComponentProps<"input"> & FieldProps) {
  return (
    <FieldShell name={name} label={label} hint={hint} required={props.required && !props.readOnly}>
      <input name={name} className={inputClass} aria-invalid={useInvalid(name) || undefined} {...props} />
    </FieldShell>
  );
}

export function TextAreaField({ label, hint, name, ...props }: ComponentProps<"textarea"> & FieldProps) {
  return (
    <FieldShell name={name} label={label} hint={hint} required={props.required}>
      <textarea name={name} rows={3} className={inputClass} aria-invalid={useInvalid(name) || undefined} {...props} />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  name,
  options,
  ...props
}: ComponentProps<"select"> & FieldProps & { options: { value: string; label: string }[] }) {
  return (
    <FieldShell name={name} label={label} hint={hint} required={props.required}>
      <select name={name} className={inputClass} aria-invalid={useInvalid(name) || undefined} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, name, ...props }: ComponentProps<"input"> & { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} className="size-4 accent-primary" {...props} />
      <span className="font-medium">{label}</span>
    </label>
  );
}

export function SubmitButton({
  children,
  pendingText = "Saving…",
  ...props
}: ComponentProps<typeof Button> & { /** Shown while the form is being sent. */ pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? pendingText : children}
    </Button>
  );
}
