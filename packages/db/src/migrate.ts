import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "./client.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(sql: Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const already = await sql`SELECT 1 FROM _migrations WHERE name = ${file}`;
    if (already.length > 0) continue;

    const ddl = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await sql.unsafe(ddl);
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  }
}
