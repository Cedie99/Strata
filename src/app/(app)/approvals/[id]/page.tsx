import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DataTable, PageHeader, sectionLabel } from "@/components/ui/layout";
import { requireUser } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDateTime, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { approveRequest, rejectRequest, withdrawRequest } from "@/modules/approvals/actions";
import { cannotDecide, mayView } from "@/modules/approvals/engine";
import type { Details } from "@/modules/approvals/kinds";
import { KIND_LABELS } from "@/modules/approvals/module";
import { ApprovalTabs, StatusTag } from "../shared";
import { DecisionPanel, WithdrawButton } from "./decision-panel";

export const metadata: Metadata = { title: "Approval request" };

/** One request: what was submitted, why it needs approval, each step, and Approve / Reject for the current approver. */
export default async function ApprovalRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const [{ id }, sp, user, scope, settings] = await Promise.all([params, searchParams, requireUser(), getBranchScope(), getSettings()]);
  const request = await db.approvalRequest.findUnique({
    where: { id },
    include: {
      branch: true,
      requestedBy: { select: { name: true } },
      steps: { orderBy: { level: "asc" }, include: { decider: { select: { name: true } } } },
    },
  });
  if (!request || !(await mayView(request, user, scope))) notFound();

  const details = JSON.parse(request.details) as Details;
  const reasons = JSON.parse(request.reasons) as string[];
  const blocked = await cannotDecide(request, user, scope);
  const mine = request.requestedById === user.id;
  const waitingStep = request.steps.find((s) => s.level === request.step);
  const last = request.step >= request.steps.length;

  return (
    <>
      <PageHeader
        title={`${request.number} · ${request.title}`}
        description={`${KIND_LABELS[request.kind] ?? request.kind}, asked by ${request.requestedBy.name} on ${formatDateTime(request.requestedAt)}, branch ${request.branch.code}.`}
        actions={mine && request.status === "PENDING" ? <WithdrawButton action={withdrawRequest.bind(null, id)} number={request.number} /> : undefined}
      />
      <ApprovalTabs user={user} active={mine ? "requests" : "inbox"} />

      {sp.sent && request.status === "PENDING" && (
        <p className="mb-3 border border-accent bg-accent/15 px-3 py-2 font-semibold">
          Sent for approval. Nothing is posted yet: it will be posted when the last approver approves it.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="What is waiting">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {details.fields.map((f) => (
                <div key={f.label}>
                  <dt className={sectionLabel}>{f.label}</dt>
                  <dd className="mt-0.5 font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {details.items && details.items.rows.length > 0 && (
            <DataTable>
              <thead>
                <tr>
                  {details.items.columns.map((c, i) => (
                    <th key={c} className={i > 0 ? "text-right" : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {details.items.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className={ci > 0 ? `text-right tabular-nums ${cell.includes("⚠") ? "font-semibold text-danger" : ""}` : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          <Card title="Why it needs approval">
            <ul className="list-disc space-y-1 pl-5">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Approval">
            <div className="mb-3 flex items-center gap-2">
              <StatusTag status={request.status} />
              <span className="tabular-nums text-muted">{formatMoney(request.amount, settings["company.currency"])}</span>
            </div>
            <ol className="space-y-2">
              {request.steps.map((s) => (
                <li key={s.id} className={`border-l-4 px-3 py-1.5 ${s.status === "APPROVED" ? "border-ok" : s.status === "REJECTED" ? "border-danger" : s.level === request.step && request.status === "PENDING" ? "border-accent" : "border-border"}`}>
                  <div className="font-semibold">
                    {s.level}. {s.roleName}
                  </div>
                  <div className="text-xs text-muted">{s.ruleName}</div>
                  {s.status !== "WAITING" ? (
                    <div className={s.status === "APPROVED" ? "text-ok" : "text-danger"}>
                      {s.status === "APPROVED" ? "Approved" : "Rejected"} by {s.decider?.name ?? "?"}, {s.decidedAt ? formatDateTime(s.decidedAt) : ""}
                      {s.reason && <span className="block text-text">&ldquo;{s.reason}&rdquo;</span>}
                    </div>
                  ) : (
                    <div className="text-muted">{request.status === "PENDING" && s.level === request.step ? "Waiting now" : request.status === "PENDING" ? "Next" : "Not reached"}</div>
                  )}
                </li>
              ))}
            </ol>
            {request.status === "APPROVED" && request.resultHref && (
              <p className="mt-3">
                Posted as{" "}
                <Link href={request.resultHref} className="font-mono text-primary hover:underline">
                  {request.resultNumber}
                </Link>
                .
              </p>
            )}
            {request.status === "REJECTED" && <p className="mt-3 text-danger">Rejected: nothing was posted. Correct it and submit it again if needed.</p>}
            {request.status === "CANCELLED" && <p className="mt-3 text-muted">Withdrawn by the requester: nothing was posted.</p>}
          </Card>

          {request.status === "PENDING" &&
            (blocked ? (
              <p className="px-1 text-sm text-muted">
                {mine ? `Waiting for ${waitingStep?.roleName ?? "an approver"}. You will see the decision here.` : blocked}
              </p>
            ) : (
              <Card title={`Your decision · step ${request.step} of ${request.steps.length}`}>
                <DecisionPanel approve={approveRequest.bind(null, id)} reject={rejectRequest.bind(null, id)} last={last} />
              </Card>
            ))}
        </div>
      </div>
    </>
  );
}
