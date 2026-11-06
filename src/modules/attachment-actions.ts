"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/core/audit";
import { db } from "@/core/db";
import type { ActionState } from "@/core/forms";
import { removeFile, saveFile } from "@/core/storage";
import { requireAttachmentAccess } from "./attachments";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;

export async function uploadAttachments(
  entity: string,
  entityId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, recordHref } = await requireAttachmentAccess(entity, entityId, "manage");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { fieldErrors: { files: ["Choose at least one file"] } };
  if (files.length > MAX_FILES) return { fieldErrors: { files: [`At most ${MAX_FILES} files at a time`] } };
  const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
  if (tooBig) return { fieldErrors: { files: [`"${tooBig.name}" is larger than 10 MB`] } };

  // Files are written first; if saving the rows fails, they are removed again.
  const stored = await Promise.all(files.map(async (f) => ({ file: f, key: await saveFile(Buffer.from(await f.arrayBuffer())) })));
  try {
    await db.$transaction(async (tx) => {
      for (const { file, key } of stored) {
        const created = await tx.attachment.create({
          data: {
            entity,
            entityId,
            fileName: file.name.slice(0, 255) || "file",
            contentType: (file.type || "application/octet-stream").slice(0, 100),
            size: file.size,
            storageKey: key,
            uploadedById: user.id,
          },
        });
        await audit({ userId: user.id, action: "attach", entity, entityId, after: { file: created.fileName, size: created.size } }, tx);
      }
    });
  } catch (e) {
    await Promise.all(stored.map((s) => removeFile(s.key)));
    throw e;
  }

  revalidatePath(recordHref, "layout");
  return { ok: `${files.length} file(s) uploaded.` };
}

export async function deleteAttachment(id: string): Promise<ActionState> {
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return { error: "That file was already removed." };
  const { user, recordHref } = await requireAttachmentAccess(attachment.entity, attachment.entityId, "manage");

  await db.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id } });
    await audit(
      { userId: user.id, action: "detach", entity: attachment.entity, entityId: attachment.entityId, before: { file: attachment.fileName } },
      tx,
    );
  });
  await removeFile(attachment.storageKey);

  revalidatePath(recordHref, "layout");
  return undefined;
}
