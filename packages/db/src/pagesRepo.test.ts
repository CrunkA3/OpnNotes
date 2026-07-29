import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";
import { deletePageById, getPageById, upsertPage } from "./pagesRepo.js";

const base = {
  id: "01J8ZC7Q9V3K7M2F0X4RABCDEF",
  path: "Projects/OpnNotes",
  title: "OpnNotes",
  tags: ["project"],
  aliases: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  contentHash: "hash1",
  ftsText: "OpnNotes markdown notes app",
};

test("upsert then get returns the row; upsert again updates it", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, base);
    let row = await getPageById(sql, base.id);
    expect(row?.title).toBe("OpnNotes");
    expect(row?.tags).toEqual(["project"]);

    await upsertPage(sql, { ...base, title: "Renamed", contentHash: "hash2" });
    row = await getPageById(sql, base.id);
    expect(row?.title).toBe("Renamed");
    expect(row?.contentHash).toBe("hash2");
  });
});

test("full-text search matches indexed content", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, base);
    const hits = await sql<{ page_id: string }[]>`
      SELECT page_id FROM page_fts WHERE tsv @@ plainto_tsquery('english', 'markdown')`;
    expect(hits.map((h) => h.page_id)).toEqual([base.id]);
  });
});

test("delete removes page and cascades fts", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, base);
    await deletePageById(sql, base.id);
    expect(await getPageById(sql, base.id)).toBeNull();
    const fts = await sql`SELECT 1 FROM page_fts WHERE page_id = ${base.id}`;
    expect(fts.length).toBe(0);
  });
});
