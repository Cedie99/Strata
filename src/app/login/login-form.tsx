"use client";

import { useState, type KeyboardEvent } from "react";
import type { ActionState } from "@/core/forms";
import { ActionForm, SubmitButton } from "@/components/ui/form";

const labelClass = "mb-1 block text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
const inputClass =
  "w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20";

export function LoginForm({
  action,
  next,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  next?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  // Controlled, so a failed sign-in keeps the email (React resets the rest of the form, i.e. the password).
  const [email, setEmail] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const watchCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  return (
    <ActionForm action={action} className="space-y-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block">
        <span className={labelClass}>Email address</span>
        <span className="relative block">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 fill-muted"
            aria-hidden
          >
            <path d="M2.5 4h15A1.5 1.5 0 0 1 19 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 1 14.5v-9A1.5 1.5 0 0 1 2.5 4Zm.6 1.8 6.9 5 6.9-5H3.1Zm14.1 1.5-6.7 4.9a.9.9 0 0 1-1 0L2.8 7.3v7h14.4v-7Z" />
          </svg>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="name@company.com"
            required
            autoFocus
            className={`${inputClass} pl-9`}
          />
        </span>
      </label>

      <label className="block">
        <span className={labelClass}>Password</span>
        <span className="relative block">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 fill-muted"
            aria-hidden
          >
            <path d="M10 1.5a4.5 4.5 0 0 1 4.5 4.5v2h.5A1.5 1.5 0 0 1 16.5 9.5v8A1.5 1.5 0 0 1 15 19H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 8h.5V6A4.5 4.5 0 0 1 10 1.5Zm0 1.8A2.7 2.7 0 0 0 7.3 6v2h5.4V6A2.7 2.7 0 0 0 10 3.3Zm0 8a1.4 1.4 0 0 0-.7 2.6v1.6h1.4v-1.6a1.4 1.4 0 0 0-.7-2.6Z" />
          </svg>
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            onKeyDown={watchCaps}
            onKeyUp={watchCaps}
            onBlur={() => setCapsLock(false)}
            className={`${inputClass} pr-16 pl-9`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm px-2 py-1 text-[11px] font-bold tracking-wide text-primary uppercase hover:bg-row-hover"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </span>
        {capsLock && (
          <span role="status" className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-danger">
            <span aria-hidden>⇪</span> Caps Lock is on
          </span>
        )}
      </label>

      <SubmitButton className="w-full py-2.5! text-[14px]" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}
