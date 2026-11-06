import "server-only";
import Link from "next/link";
import { Card } from "@/components/ui/layout";
import { formatDateTime } from "@/core/format";
import { trailFor } from "@/modules/approvals/engine";
import { KIND_LABELS, STATUS_LABELS } from "@/modules/approvals/module";

/** On a document page: the approvals that let it be posted, and any void or reversal waiting for approval. */
export async function ApprovalTrail({ documentId }: { documentId: string }) {
  const requests = await trailFor(documentId);
  if (requests.length === 0) return null;
  return (
    <Card title="Approvals">
      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id}>
            <div>
              <Link href={`/approvals/${r.id}`} className="font-mono text-primary hover:underline">
                {r.number}
              </Link>{" "}
              <span className="text-muted">
                {KIND_LABELS[r.kind] ?? r.kind} · {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </div>
            <div className="text-xs text-muted">
              Asked by {r.requestedBy.name}, {formatDateTime(r.requestedAt)}
            </div>
            {r.steps
              .filter((s) => s.status !== "WAITING")
              .map((s) => (
                <div key={s.id} className={`text-xs ${s.status === "APPROVED" ? "text-ok" : "text-danger"}`}>
                  {s.status === "APPROVED" ? "Approved" : "Rejected"} by {s.decider?.name ?? "?"} ({s.roleName}), {s.decidedAt ? formatDateTime(s.decidedAt) : ""}
                  {s.reason && <span className="text-text"> · &ldquo;{s.reason}&rdquo;</span>}
                </div>
              ))}
            {r.status === "PENDING" && <div className="text-xs font-semibold">Waiting for {r.steps.find((s) => s.level === r.step)?.roleName ?? "an approver"}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
