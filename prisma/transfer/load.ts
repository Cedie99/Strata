// Step 2 of moving databases: run after DATABASE_URL points at the NEW, freshly migrated (empty) database.
//   npx tsx prisma/transfer/load.ts
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { TABLES } from "./tables";

const db = new PrismaClient();
const CHUNK = 1000;

async function main() {
  const data = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8")) as Record<string, object[]>;
  if ((await db.user.count()) > 0) throw new Error("The target database already has users. Load only into an empty database.");

  for (const table of TABLES) {
    let rows = data[table] ?? [];
    // The audit chain is rebuilt by the database as rows arrive, so load them in their original order
    // without the old chain columns. Reversals must come after the entries they reverse.
    if (table === "auditLog")
      rows = (rows as { seq: string }[])
        .sort((a, b) => Number(a.seq) - Number(b.seq))
        .map((row: Record<string, unknown>) => {
          const r = { ...row };
          delete r.seq;
          delete r.prevHash;
          delete r.hash;
          return r;
        });
    if (table === "journalEntry") rows = (rows as { createdAt: string }[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let i = 0; i < rows.length; i += CHUNK) {
      // The starting chart of accounts is created by the migrations; skip those rows, load the rest.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db[table] as any).createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: table === "account" });
    }
    console.log(`${table}: ${rows.length}`);
  }
  console.log("Done. Check the app, then delete prisma/transfer/data.json.");
}

main().finally(() => db.$disconnect());
