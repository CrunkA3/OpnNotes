import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createClient, type Sql } from "./client.js";
import { migrate } from "./migrate.js";

export async function withTestDb(fn: (sql: Sql) => Promise<void>): Promise<void> {
  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const sql = createClient(container.getConnectionUri());

  try {
    await migrate(sql);
    await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
    await container.stop();
  }
}
