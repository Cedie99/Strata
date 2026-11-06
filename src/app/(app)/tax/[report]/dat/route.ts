import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { REPORTS } from "@/modules/tax/catalog";
import { P } from "@/modules/tax/module";

// GET /tax/<sls|slp>/dat?f_q=2026-Q4 → the summary list as a BIR RELIEF .DAT file

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  await requirePermission(P.view);
  const def = REPORTS[(await params).report];
  if (!def?.dat) notFound();
  const query = Object.fromEntries([...new URL(request.url).searchParams].filter(([k]) => /^f_\w+$/.test(k)));
  const scope = await getBranchScope();
  const { name, body } = await def.dat(scope.ids, query);
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
