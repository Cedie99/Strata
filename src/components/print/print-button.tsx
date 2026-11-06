import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/** Opens a document's printable page in a new tab (Print / Save as PDF from there). */
export function PrintButton({ href, label = "Print" }: { href: string; label?: string }) {
  return (
    <Link href={href} target="_blank" prefetch={false} className={buttonClass("secondary")}>
      <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden>
        <path d="M5 2h10v4H5zM3 7h14a2 2 0 0 1 2 2v5h-3v4H4v-4H1V9a2 2 0 0 1 2-2Zm3 6v3h8v-3zm9-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
      </svg>
      {label}
    </Link>
  );
}

/** A small "Print" text link for rows in a table. */
export function PrintLink({ href }: { href: string }) {
  return (
    <Link href={href} target="_blank" prefetch={false} className="text-primary hover:underline">
      Print
    </Link>
  );
}
