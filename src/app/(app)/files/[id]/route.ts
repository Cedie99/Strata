import { db } from "@/core/db";
import { readStoredFile } from "@/core/storage";
import { requireAttachmentAccess } from "@/modules/attachments";

// Only these open in the browser (with ?inline=1); everything else always downloads,
// so an uploaded HTML or SVG file can never run as a page of this site.
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new Response("Not found", { status: 404 });
  await requireAttachmentAccess(attachment.entity, attachment.entityId, "view");

  const bytes = await readStoredFile(attachment.storageKey);
  const inline = new URL(request.url).searchParams.has("inline") && INLINE_TYPES.has(attachment.contentType);
  const name = encodeURIComponent(attachment.fileName);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": inline ? attachment.contentType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
