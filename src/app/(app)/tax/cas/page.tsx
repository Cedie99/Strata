import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card, DataTable, PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatMoney, toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P as ADMIN } from "@/modules/admin/module";
import { auditChain, ledgerBalanced, protectedTables, seriesGaps } from "@/modules/tax/cas";
import { P } from "@/modules/tax/module";

export const metadata: Metadata = { title: "CAS readiness" };

const MANUAL = "https://claude.ai/artifact/FjQsMNTjouzEEMWKaHBr2R";

/** What a BIR examiner checks before registering a computerized accounting system, checked live. */
export default async function CasReadinessPage() {
  const user = await requirePermission(P.view);
  const [series, tables, chain, ledger, closed, settings] = await Promise.all([
    seriesGaps(),
    protectedTables(),
    auditChain(),
    ledgerBalanced(),
    db.accountingPeriod.count({ where: { status: "CLOSED" } }),
    getSettings(),
  ]);
  const seriesOk = series.every((s) => s.ok);
  const tablesOk = tables.every((t) => t.ok);
  const companyOk = Boolean(settings["company.tin"] && settings["company.rdo"] && settings["company.address"]);
  const yearStart = toDateInput(new Date(new Date().getFullYear(), 0, 1));

  const items = [
    { ok: seriesOk, label: "No gaps in document series", detail: seriesOk ? "Every numbered document runs 1, 2, 3… without a missing number." : "Some numbers are missing; see the table below." },
    { ok: tablesOk, label: "Posted records cannot be changed or deleted", detail: tablesOk ? "The database refuses edits and deletes of posted documents and journal entries." : "Some protections are missing; see the table below." },
    {
      ok: chain.firstBroken === null,
      label: "Audit trail shows tampering",
      detail: chain.firstBroken === null ? `All ${chain.checked.toLocaleString()} audit entries are chained and unaltered.` : `Entry #${chain.firstBroken} was altered after it was written.`,
    },
    { ok: ledger.ok, label: "Books balance", detail: `Total debits ${formatMoney(ledger.debit)}, total credits ${formatMoney(ledger.credit)}.` },
    { ok: companyOk, label: "Company TIN, RDO and address on file", detail: companyOk ? "Printed on every report and data file." : "Fill them in under Setup → Global Setup → Company settings." },
    { ok: closed > 0, label: "Months are closed after review", detail: closed ? `${closed} month(s) closed; closed months take no postings.` : "No month has been closed yet (Accounting → Periods)." },
  ];

  return (
    <>
      <PageHeader title="CAS readiness" description="What the BIR checks before registering a computerized accounting system (CAS / CBA), checked live." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <ul className="space-y-2 border border-border bg-surface px-4 py-3">
            {items.map((i) => (
              <li key={i.label} className="flex gap-3">
                <span className={`w-5 flex-none font-bold ${i.ok ? "text-ok" : "text-danger"}`}>{i.ok ? "✓" : "⚠"}</span>
                <div>
                  <div className="font-semibold">{i.label}</div>
                  <div className={i.ok ? "text-muted" : "text-danger"}>{i.detail}</div>
                </div>
              </li>
            ))}
          </ul>

          <DataTable>
            <thead>
              <tr>
                <th>Document series</th>
                <th className="text-right">Numbers issued</th>
                <th>Gaps</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.docType}>
                  <td>{s.name}</td>
                  <td className="text-right tabular-nums">{s.count.toLocaleString()}</td>
                  <td className={s.ok ? "text-ok" : "font-mono text-danger"}>{s.ok ? "None" : s.gaps.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <DataTable>
            <thead>
              <tr>
                <th>Protected table</th>
                <th>Edits and deletes</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.table}>
                  <td className="font-mono">{t.table}</td>
                  <td className={t.ok ? "text-ok" : "font-semibold text-danger"}>{t.ok ? "Refused by the database" : "Not protected"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>

        <div className="space-y-6">
          <Card title="For the BIR examiner">
            <ul className="space-y-3">
              <li>
                <b>Books of accounts</b>: BIR → Books of accounts, each exportable to Excel for any period.
              </li>
              <li>
                <b>Audit trail</b>: every change with who, when and the values before and after.
                {can(user, ADMIN.auditView) ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <a href={`/tax/cas/audit-trail?f_from=${yearStart}`} className={buttonClass("tool")} download>
                      Export audit trail
                    </a>
                    <Link href="/admin/audit?verify=1" className={buttonClass("tool")}>
                      Verify chain
                    </Link>
                  </div>
                ) : (
                  <div className="text-xs text-muted">Exporting it needs the &quot;View audit log&quot; permission.</div>
                )}
              </li>
              <li>
                <b>System documentation</b>: the user manual explains every screen, posting and control.{" "}
                <a href={MANUAL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Open the manual
                </a>
              </li>
              <li>
                <b>Printed documents</b> carry &quot;Internal document, not a BIR-registered invoice or receipt&quot; until the system is registered.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
