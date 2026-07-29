import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";
import { upsertPage } from "./pagesRepo.js";
import { keywordSearch } from "./searchRepo.js";

test("keywordSearch ranks matching pages", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, {
      id: "01J8ZC7Q9V3K7M2F0X4RAAAAAA",
      path: "A",
      title: "Markdown Guide",
      tags: [],
      aliases: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      contentHash: "h",
      ftsText: "markdown markdown notes",
    });
    await upsertPage(sql, {
      id: "01J8ZC7Q9V3K7M2F0X4RBBBBBB",
      path: "B",
      title: "Other",
      tags: [],
      aliases: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      contentHash: "h",
      ftsText: "unrelated content",
    });

    const hits = await keywordSearch(sql, "markdown");
    expect(hits.map((h) => h.path)).toEqual(["A"]);
    expect(hits[0]!.rank).toBeGreaterThan(0);
  });
});
