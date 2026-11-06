import { DataTable, EmptyRow } from "@/components/ui/layout";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import { deleteAttachment, uploadAttachments } from "@/modules/attachment-actions";
import { DeleteFileButton, UploadForm } from "./attachment-forms";

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const VIEWABLE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Files attached to one record. The caller has already checked the user may view the record. */
export async function AttachmentsPanel({ entity, entityId, canManage }: { entity: string; entityId: string; canManage: boolean }) {
  const files = await db.attachment.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return (
    <div className="max-w-5xl space-y-3 px-1">
      {canManage && <UploadForm action={uploadAttachments.bind(null, entity, entityId)} />}
      <DataTable>
        <thead>
          <tr>
            <th>File</th>
            <th className="text-right">Size</th>
            <th>Uploaded</th>
            <th>By</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {files.length === 0 && <EmptyRow colSpan={5}>No files attached.</EmptyRow>}
          {files.map((f) => (
            <tr key={f.id}>
              <td>
                <a href={`/files/${f.id}`} className="text-primary hover:underline">
                  {f.fileName}
                </a>
                {VIEWABLE.has(f.contentType) && (
                  <a href={`/files/${f.id}?inline=1`} target="_blank" rel="noopener" className="ml-2 text-xs text-muted hover:underline">
                    view
                  </a>
                )}
              </td>
              <td className="text-right tabular-nums">{formatSize(f.size)}</td>
              <td>{formatDateTime(f.createdAt)}</td>
              <td>{f.uploadedBy?.name ?? "-"}</td>
              <td className="w-px">
                {canManage && <DeleteFileButton action={deleteAttachment.bind(null, f.id)} fileName={f.fileName} />}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
