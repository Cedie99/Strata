import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { dayBound } from "@/core/grid";
import { buildWorkbook, xlsxResponse } from "@/core/spreadsheet";
import { P as ADMIN } from "@/modules/admin/module";

// GET /tax/cas/audit-trail?f_from=YYYY-MM-DD&f_to=YYYY-MM-DD → the audit log with its hash chain, as .xlsx

export async function GET(request: Request) {
  await requirePermission(ADMIN.auditView);
  const search = new URL(request.url).searchParams;
  const from = dayBound(search.get("f_from") ?? undefined, false);
  const to = dayBound(search.get("f_to") ?? undefined, true);
  const rows = await db.auditLog.findMany({
    where: { ...((from || to) && { at: { ...(from && { gte: from }), ...(to && { lt: to }) } }) },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { seq: "asc" },
  });
  const bytes = await buildWorkbook(
    "Audit trail",
    ["Seq", "When", "User", "Email", "Action", "Record type", "Record id", "Before", "After", "Previous hash", "Hash"],
    rows.map((r) => [
      Number(r.seq),
      r.at.toISOString(),
      r.user?.name ?? "System",
      r.user?.email ?? null,
      r.action,
      r.entity,
      r.entityId,
      r.before,
      r.after,
      r.prevHash,
      r.hash,
    ]),
  );
  return xlsxResponse(bytes, "Audit trail");
}
