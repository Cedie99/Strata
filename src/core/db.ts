import { PrismaClient } from "@prisma/client";

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The database is remote and audited writes queue on the audit chain's lock, so a transaction of a
// few queries can pass Prisma's 5 s default. Postings and imports still pass their own, longer limits.
export const db =
  globalForPrisma.prisma ?? new PrismaClient({ transactionOptions: { timeout: 30_000, maxWait: 10_000 } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
