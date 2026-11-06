import Link from "next/link";
import type { ComponentProps } from "react";

const variants = {
  primary: "border border-primary bg-primary text-primary-text hover:opacity-90",
  secondary: "border border-border bg-surface text-text hover:bg-row-hover",
  danger: "border border-danger bg-danger text-white hover:opacity-90",
  /** Grid toolbar buttons: NEW / EDIT / DELETE. */
  tool: "min-w-20 border border-[#b9bec4] bg-surface text-text uppercase hover:bg-row-hover disabled:hover:bg-surface",
};

export type ButtonVariant = keyof typeof variants;

export function buttonClass(variant: ButtonVariant = "primary") {
  return `inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1 disabled:opacity-50 ${variants[variant]}`;
}

export function Button({ variant, className = "", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={`${buttonClass(variant)} ${className}`} {...props} />;
}

export function LinkButton({
  variant,
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={`${buttonClass(variant)} ${className}`} {...props} />;
}
