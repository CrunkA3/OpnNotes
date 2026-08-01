import { mkdir } from "node:fs/promises";
import { createClient, migrate } from "@opnnotes/db";
import { reindexVault } from "./reindex.js";
import { createWatcher } from "./watcher.js";

const databaseUrl = process.env.DATABASE_URL;
const vaultRoot = process.env.VAULT_ROOT ?? "/vault";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = createClient(databaseUrl);
let watcher: ReturnType<typeof createWatcher> | undefined;
let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (watcher) {
    await watcher.close();
  }

  await sql.end({ timeout: 5 });
};

try {
  await mkdir(vaultRoot, { recursive: true });
  await migrate(sql);
  await reindexVault(sql, vaultRoot, new Date().toISOString());

  watcher = createWatcher(sql, vaultRoot, () => new Date().toISOString());

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown().finally(() => process.exit(0));
    });
  }

  await watcher.ready;
} catch (error) {
  await shutdown();
  throw error;
}
