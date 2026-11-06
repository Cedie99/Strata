import type { Metadata } from "next";
import { DataTable, PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import { setPeriodStatus } from "@/modules/accounting/actions";
import { P } from "@/modules/accounting/module";
import { PeriodButton } from "./period-button";

export const metadata: Metadata = { title: "Accounting periods" };

export default async function PeriodsPage() {
  const user = await requirePermission(P.view);
  const [first, periods, counts] = await Promise.all([
    db.journalEntry.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    db.accountingPeriod.findMany({ include: { closedBy: { select: { name: true } } } }),
    db.$queryRaw<{ y: number; m: number; n: bigint }[]>`
      SELECT extract(year FROM "date")::int AS y, extract(month FROM "date")::int AS m, count(*) AS n FROM "JournalEntry" GROUP BY 1, 2`,
  ]);
  const now = new Date();
  const start = first ? first.date.getFullYear() * 12 + first.date.getMonth() : now.getFullYear() * 12 + now.getMonth();
  const end = now.getFullYear() * 12 + now.getMonth();
  const byKey = new Map(periods.map((p) => [p.year * 12 + p.month - 1, p]));
  const count = new Map(counts.map((c) => [c.y * 12 + c.m - 1, Number(c.n)]));
  const months = Array.from({ length: end - start + 1 }, (_, i) => start + i).map((k) => ({
    key: k,
    year: Math.floor(k / 12),
    month: (k % 12) + 1,
    label: new Date(Math.floor(k / 12), k % 12, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" }),
    period: byKey.get(k),
    entries: count.get(k) ?? 0,
  }));
  // Months close in order and reopen in reverse order (see setPeriodStatus).
  const nextToClose = months.find((m) => m.period?.status !== "CLOSED");
  const lastClosed = [...months].reverse().find((m) => m.period?.status === "CLOSED");
  const manage = can(user, P.periodsManage);

  return (
    <>
      <PageHeader
        title="Accounting periods"
        description="Close a month once its figures are checked and reported. A closed month takes no postings from any module; the database enforces it."
      />
      <div className="max-w-4xl">
        <DataTable>
          <thead>
            <tr>
              <th>Month</th>
              <th className="text-right">Entries</th>
              <th>Status</th>
              <th>Closed by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((m) => {
              const closed = m.period?.status === "CLOSED";
              return (
                <tr key={m.key}>
                  <td className="font-semibold">{m.label}</td>
                  <td className="text-right tabular-nums">{m.entries}</td>
                  <td className={closed ? "font-semibold" : "text-ok"}>{closed ? "🔒 Closed" : "Open"}</td>
                  <td>{closed && m.period?.closedAt ? `${m.period.closedBy?.name ?? "-"}, ${formatDateTime(m.period.closedAt)}` : "-"}</td>
                  <td className="text-right">
                    {manage && nextToClose?.key === m.key && m.key < end && (
                      <PeriodButton action={setPeriodStatus.bind(null, m.year, m.month, "CLOSED")} label="Close month" month={m.label} closing />
                    )}
                    {manage && lastClosed?.key === m.key && (
                      <PeriodButton action={setPeriodStatus.bind(null, m.year, m.month, "OPEN")} label="Reopen" month={m.label} closing={false} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <p className="mt-2 px-1 text-xs text-muted">The current month cannot be closed until it has ended.</p>
      </div>
    </>
  );
}
