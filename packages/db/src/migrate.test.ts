import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";

test("migrate creates the cache tables and vector extension", async () => {
  await withTestDb(async (sql) => {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`;
    const names = tables.map((t) => t.table_name);
    expect(names).toContain("pages");
    expect(names).toContain("page_fts");
    expect(names).toContain("links");

    const ext = await sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`;
    expect(ext.length).toBe(1);

    const { migrate } = await import("./migrate.js");
    await expect(migrate(sql)).resolves.toBeUndefined();
  });
});
