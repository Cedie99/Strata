import Link from "next/link";
import type { ReactNode } from "react";

/** Small capitals used for section headings, card titles and form labels, so content stands out from labels. */
export const sectionLabel = "text-[11px] font-bold tracking-[0.08em] text-muted uppercase";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-3 px-1">
      <div>
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  );
}

export type Tab = { label: string; href?: string; active?: boolean };

/**
 * The tab strip under the page title: "List" for the grid, "General" for one record.
 * Tabs without an href are shown disabled (e.g. "General" before a record is chosen).
 */
export function Tabs({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="mb-3 flex gap-0.5 overflow-x-auto border-b border-border px-1">
      {tabs.map((t) =>
        t.active ? (
          <span key={t.label} className="-mb-px border border-t-2 border-border border-t-accent border-b-surface bg-surface px-9 py-1.5 font-semibold whitespace-nowrap">
            {t.label}
          </span>
        ) : t.href ? (
          <Link key={t.label} href={t.href} className="bg-tab px-7 py-1.5 font-medium whitespace-nowrap text-tab-text hover:brightness-110">
            {t.label}
          </Link>
        ) : (
          <span key={t.label} className="bg-tab px-7 py-1.5 whitespace-nowrap text-tab-text opacity-60">
            {t.label}
          </span>
        ),
      )}
    </div>
  );
}

/** Tabs for a list page and its record pages. */
export const listTabs = (listHref: string, onRecord: boolean, extra: Tab[] = []): Tab[] => [
  { label: "List", href: listHref, active: !onRecord },
  { label: "General", active: onRecord },
  ...extra,
];

/** Tabs for one record that has attachments: List | General | Attachments. recordHref is null while creating. */
export const recordTabs = (
  listHref: string,
  recordHref: string | null,
  active: "general" | "attachments",
  attachmentCount = 0,
): Tab[] => [
  { label: "List", href: listHref },
  { label: "General", href: recordHref ?? undefined, active: active === "general" },
  {
    label: attachmentCount ? `Attachments (${attachmentCount})` : "Attachments",
    href: recordHref ? `${recordHref}/attachments` : undefined,
    active: active === "attachments",
  },
];

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border border-border bg-surface p-4 ${className}`}>
      {title && (
        <h2 className={`-mx-4 -mt-4 mb-4 border-b border-border bg-row-alt px-4 py-2 ${sectionLabel}`}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = "muted", children }: { tone?: "muted" | "ok" | "danger"; children: ReactNode }) {
  const tones = { muted: "text-muted", ok: "text-ok", danger: "font-semibold text-danger" };
  return <span className={tones[tone]}>{children}</span>;
}

/**
 * Shared styling for every table: small uppercase column headers that stay out of the way,
 * rows tall enough to follow across the screen, zebra striping and aligned digits.
 */
export const tableClass =
  "w-full border-collapse text-left [&_td]:px-2 [&_td]:py-[5px] [&_td]:whitespace-nowrap [&_td]:align-middle [&_th]:border-b-2 [&_th]:border-border [&_th]:bg-grid-head [&_th]:px-2 [&_th]:py-2 [&_th]:text-[11px] [&_th]:font-bold [&_th]:tracking-[0.06em] [&_th]:text-muted [&_th]:uppercase [&_th]:whitespace-nowrap [&_th+th]:border-l [&_th+th]:border-l-border/60 [&_tbody_tr]:border-b [&_tbody_tr]:border-border/50 [&_tbody_tr:nth-child(even)]:bg-row-alt";

/** Wraps a <table> in a scrollable bordered box with consistent cell styling. */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className={`${tableClass} [&_tbody_tr:hover]:bg-row-hover`}>{children}</table>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6! text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
