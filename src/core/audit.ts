import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/core/db";

type AuditEntry = {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

const toJson = (v: unknown) =>
  v === undefined ? null : JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));

/** Record an audit entry. Pass a transaction client to log inside the same transaction. */
export async function audit(entry: AuditEntry, tx: Prisma.TransactionClient = db) {
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
