import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/ui/grid-filters";
import { DataTable, EmptyRow, PageHeader, sectionLabel } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import { dayBound, readGridQuery, type GridFilter } from "@/core/grid";
import type { Prisma } from "@prisma/client";
import { P } from "@/modules/admin/module";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

// Readable names for the record types stored in the log; custom modules already log "Module / Record type".
const ENTITY_NAMES: Record<string, string> = {
  CustomModule: "Custom module",
  DocumentSeries: "Document numbering",
  StockMovement: "Stock movement",
  Setting: "Settings",
  AccountingPeriod: "Accounting period",
};
const entityName = (e: string) => ENTITY_NAMES[e] ?? e.replace(/([a-z])([A-Z])/g, "$1 $2");

const ACTION_STYLES: Record<string, string> = {
  create: "bg-ok/12 text-ok ring-ok/25",
  import: "bg-ok/12 text-ok ring-ok/25",
  attach: "bg-ok/12 text-ok ring-ok/25",
  update: "bg-text/8 text-text ring-text/25",
  "import-update": "bg-text/8 text-text ring-text/25",
  delete: "bg-danger/10 text-danger ring-danger/25",
  detach: "bg-danger/10 text-danger ring-danger/25",
  void: "bg-danger/10 text-danger ring-danger/25",
  reopen: "bg-danger/10 text-danger ring-danger/25",
};

const ACTIONS = ["create", "update", "delete", "void", "close", "reopen", "import", "import-update", "attach", "detach", "login", "logout"];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission(P.auditView);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { filters: f } = await readGridQuery(Promise.resolve(params));
  const dateFrom = dayBound(f.f_date_from, false);
  const dateTo = dayBound(f.f_date_to, true);
  // Filters run in the database: the log only grows.
  const filtered: Prisma.AuditLogWhereInput = {
    ...(f.f_user && { userId: f.f_user === "system" ? null : f.f_user }),
    ...(f.f_action && { action: f.f_action }),
    ...((dateFrom || dateTo) && { at: { ...(dateFrom && { gte: dateFrom }), ...(dateTo && { lt: dateTo }) } }),
    ...(f.f_record && { entityId: { contains: f.f_record, mode: "insensitive" } }),
    ...(f.f_details && {
      OR: [
        { before: { contains: f.f_details, mode: "insensitive" } },
        { after: { contains: f.f_details, mode: "insensitive" } },
      ],
    }),
  };
  const where: Prisma.AuditLogWhereInput = { ...filtered, ...(params.entity && { entity: params.entity }) };
  const users = await db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const filterDefs: GridFilter[] = [
    { key: "date", label: "Date", type: "date" },
    {
      key: "user",
      label: "User",
      type: "select",
      options: [...users.map((u) => ({ value: u.id, label: u.name })), { value: "system", label: "System" }],
    },
    {
      key: "action",
      label: "Action",
      type: "select",
      options: ACTIONS.map((a) => ({ value: a, label: a.replace("-", " ") })),
    },
    { key: "details", label: "Search in changes", type: "text" },
    { key: "record", label: "Record ID", type: "text" },
  ];

  const [entries, total, groups] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
    db.auditLog.count({ where }),
    // Chip counts follow the other filters, so they show where matching entries are.
    db.auditLog.groupBy({ by: ["entity"], where: filtered, _count: { _all: true }, orderBy: { entity: "asc" } }),
  ]);
  const allCount = groups.reduce((n, g) => n + g._count._all, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Links keep every other filter.
  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, entity: params.entity, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `?${s}` : "?";
  };
  const filter = (entity?: string) => link({ entity, page: undefined });
  const pageLink = (p: number) => link({ page: String(p) });
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  return (
    <>
      <PageHeader title="Audit log" description="Every change made in the system, newest first. Entries are permanent and chained: each one carries a fingerprint of everything before it." />
      <ChainCheck run={params.verify === "1"} />

      <div className="px-1">
        <FilterBar filters={filterDefs} values={f} keep={params.entity ? { entity: params.entity } : {}} />
      </div>
      <section className="mx-1 mb-4 border border-border bg-row-alt px-4 py-3">
        <p className={`mb-2 ${sectionLabel}`}>Record type</p>
        <div className="flex flex-wrap gap-2">
          <FilterChip href={filter()} label="All" count={allCount} active={!params.entity} />
          {groups.map((g) => (
            <FilterChip
              key={g.entity}
              href={filter(g.entity)}
              label={entityName(g.entity)}
              count={g._count._all}
              active={params.entity === g.entity}
            />
          ))}
        </div>
      </section>

      <div className="px-1">
        <DataTable>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Record</th>
              <th className="w-full">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && <EmptyRow colSpan={5}>Nothing logged yet.</EmptyRow>}
            {entries.map((e) => {
              const [date, time] = formatDateTime(e.at).split(/,\s(?=\d{1,2}:)/);
              return (
                <tr key={e.id} className="[&>td]:align-top!">
                  <td>
                    {date} <span className="text-muted">{time}</span>
                  </td>
                  <td className="font-semibold">
                    {e.user?.name ?? <span className="font-normal text-muted">System</span>}
                  </td>
                  <td>
                    <span
                      className={`inline-block rounded-full px-2 py-px text-[11px] font-semibold capitalize ring-1 ring-inset ${
                        ACTION_STYLES[e.action] ?? "bg-muted/10 text-muted ring-muted/20"
                      }`}
                    >
                      {e.action.replace("-", " ")}
                    </span>
                  </td>
                  <td>
                    {entityName(e.entity)}
                    {e.entityId && (
                      <span className="ml-2 font-mono text-[11px] text-muted" title={e.entityId}>
                        #{e.entityId.slice(-8)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-normal!">
                    {e.before || e.after ? (
                      <details className="group">
                        <summary className="inline-block cursor-pointer rounded-sm border border-border bg-surface px-2 py-0.5 text-[12px] font-semibold select-none hover:border-primary group-open:border-primary group-open:text-primary">
                          <span className="group-open:hidden">Show changes</span>
                          <span className="hidden group-open:inline">Hide changes</span>
                        </summary>
                        <div className={`mt-2 grid max-w-4xl gap-2 ${e.before && e.after ? "lg:grid-cols-2" : ""}`}>
                          {e.before && <JsonPanel title="Before" json={e.before} />}
                          {e.after && <JsonPanel title="After" json={e.after} />}
                        </div>
                      </details>
                    ) : (
                      <span className="text-muted/60">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>

        <div className="flex flex-wrap items-center justify-between gap-2 border-x border-b border-border px-3 py-1.5 text-[12px] text-muted">
          <div className="flex items-center gap-3">
            {page > 1 ? (
              <Link href={pageLink(page - 1)} className="font-semibold hover:text-primary">
                ← Newer
              </Link>
            ) : (
              <span className="opacity-40">← Newer</span>
            )}
            <span>
              Page <span className="font-semibold text-text">{page}</span> of {pages}
            </span>
            {page < pages ? (
              <Link href={pageLink(page + 1)} className="font-semibold hover:text-primary">
                Older →
              </Link>
            ) : (
              <span className="opacity-40">Older →</span>
            )}
          </div>
          <span>
            <span className="font-semibold text-text">
              {from.toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()}
            </span>{" "}
            of <span className="font-semibold text-text">{total.toLocaleString()}</span> entries
          </span>
        </div>
      </div>
    </>
  );
}

function FilterChip({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold whitespace-nowrap transition-colors ${
        active
          ? "border-primary bg-primary text-primary-text"
          : "border-border bg-surface text-text hover:border-primary hover:text-primary"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-white/20" : "bg-row-alt text-muted"}`}
      >
        {count.toLocaleString()}
      </span>
    </Link>
  );
}

function JsonPanel({ title, json }: { title: string; json: string }) {
  let text = json;
  try {
    text = JSON.stringify(JSON.parse(json), null, 2);
  } catch {}
  return (
    <div className="min-w-0 border border-border">
      <p className={`border-b border-border bg-row-alt px-2 py-1 ${sectionLabel}`}>{title}</p>
      <pre className="max-h-80 overflow-auto p-2 text-[11.5px] leading-snug">{text}</pre>
    </div>
  );
}

/**
 * Re-computes every entry's fingerprint (sha256 over its content and the previous fingerprint) in the
 * database. Any entry changed, removed or inserted out of order since it was written breaks the chain there.
 * Run on request: it reads the whole log.
 */
async function ChainCheck({ run }: { run: boolean }) {
  if (!run)
    return (
      <p className="mb-3 px-1 text-xs text-muted">
        <Link href="/admin/audit?verify=1" className="text-primary hover:underline">
          Verify the log has not been tampered with
        </Link>
      </p>
    );
  const [result] = await db.$queryRaw<{ checked: bigint; first_broken_seq: bigint | null }[]>`SELECT * FROM audit_verify()`;
  const checked = Number(result.checked).toLocaleString();
  return result.first_broken_seq === null ? (
    <p className="mb-3 border border-ok/40 bg-ok/10 px-3 py-2 font-semibold text-ok">
      ✓ Intact: all {checked} entries match their fingerprints, checked {formatDateTime(new Date())}.
    </p>
  ) : (
    <p className="mb-3 border border-danger/40 bg-danger/10 px-3 py-2 font-semibold text-danger">
      ⚠ The log was altered outside the application: entry #{result.first_broken_seq.toString()} (of {checked}) no longer matches its
      fingerprint. Everything before it is intact. Report this to management and your auditor.
    </p>
  );
}
