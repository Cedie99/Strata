// Step 1 of moving databases: run while DATABASE_URL still points at the OLD database.
//   npx tsx prisma/transfer/dump.ts
// Writes prisma/transfer/data.json (contains password hashes: keep it private, delete it afterwards).
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { TABLES } from "./tables";

const db = new PrismaClient();

async function main() {
  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data[table] = await (db[table] as any).findMany();
    console.log(`${table}: ${data[table].length}`);
  }
  writeFileSync(new URL("./data.json", import.meta.url), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  console.log("Saved prisma/transfer/data.json");
}

main().finally(() => db.$disconnect());
