import type { ReactNode } from "react";
import Link from "next/link";
import { sectionLabel } from "@/components/ui/layout";

// Small building blocks shared by the purchasing document pages.

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={sectionLabel}>{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

export function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${danger ? "font-semibold text-danger" : ""}`}>{value}</dd>
    </div>
  );
}

/** "Accounting entries: JE-… (memo) · JE-…" under a document, for users who may see the ledger. */
export function JournalTrail({ journals }: { journals: { id: string; number: string; memo: string }[] }) {
  if (journals.length === 0) return null;
  return (
    <p className="mt-6 px-1 text-xs text-muted">
      Accounting entries:{" "}
      {journals.map((j, i) => (
        <span key={j.id}>
          {i > 0 && " · "}
          <Link href={`/accounting/journals/${j.id}`} className="font-mono text-primary hover:underline">
            {j.number}
          </Link>{" "}
          ({j.memo})
        </span>
      ))}
    </p>
  );
}
