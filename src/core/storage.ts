import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Files are kept on the server's disk under STORAGE_DIR (default ./storage/attachments).
// Back this folder up together with the database. To use cloud storage later, replace these
// three functions; the rest of the app only knows the storage key.

// Keys are generated here (never from user input), so they cannot point outside the storage folder.
const fileFor = (key: string) => {
  if (!/^[a-f0-9]{2}\/[a-f0-9]{32}$/.test(key)) throw new Error("Invalid storage key");
  // The default path is written out in full so the build can tell it is runtime data, not code to trace.
  return process.env.STORAGE_DIR
    ? path.join(/*turbopackIgnore: true*/ process.env.STORAGE_DIR, key)
    : path.join(process.cwd(), "storage", "attachments", key);
};

export async function saveFile(bytes: Buffer) {
  const id = randomBytes(16).toString("hex");
  const key = `${id.slice(0, 2)}/${id}`;
  await mkdir(path.dirname(fileFor(key)), { recursive: true });
  await writeFile(fileFor(key), bytes);
  return key;
}

export async function readStoredFile(key: string) {
  return readFile(fileFor(key));
}

export async function removeFile(key: string) {
  await rm(fileFor(key), { force: true });
}
