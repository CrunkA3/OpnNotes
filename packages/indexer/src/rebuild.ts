import { createClient, migrate } from "@opnnotes/db";
import { reindexVault } from "./reindex.js";

export async function rebuild(
  databaseUrl: string,
  vaultRoot: string,
  now: string,
): Promise<{ indexed: number; removed: number }> {
  const sql = createClient(databaseUrl);
  try {
    await migrate(sql);
    return await reindexVault(sql, vaultRoot, now);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
