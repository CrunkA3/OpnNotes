import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";
import { getBacklinks, replaceLinks } from "./linksRepo.js";
import { upsertPage } from "./pagesRepo.js";

const A = "01J8ZC7Q9V3K7M2F0X4RAAAAAA";
const B = "01J8ZC7Q9V3K7M2F0X4RBBBBBB";

function page(id: string, path: string) {
  return {
    id,
    path,
    title: path,
    tags: [],
    aliases: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    contentHash: "h",
    ftsText: path,
  };
}

test("replaceLinks stores links and backlinks resolve", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, page(A, "A"));
    await upsertPage(sql, page(B, "B"));
    await replaceLinks(sql, A, [{ dstId: B, rawTarget: "B", display: "to B" }]);
    expect(await getBacklinks(sql, B)).toEqual([{ srcId: A }]);
  });
});

test("replaceLinks overwrites the previous set", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, page(A, "A"));
    await upsertPage(sql, page(B, "B"));
    await replaceLinks(sql, A, [{ dstId: B, rawTarget: "B" }]);
    await replaceLinks(sql, A, [{ dstId: null, rawTarget: "Ghost" }]);
    expect(await getBacklinks(sql, B)).toEqual([]);
    const all = await sql<{ raw_target: string }[]>`SELECT raw_target FROM links WHERE src_page_id = ${A}`;
    expect(all.map((r) => r.raw_target)).toEqual(["Ghost"]);
  });
});
