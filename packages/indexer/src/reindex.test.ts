import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBacklinks, getPageByPath, withTestDb } from "@opnnotes/db";
import { expect, test } from "vitest";
import { reindexVault } from "./reindex.js";

const NOW = "2026-07-29T12:00:00Z";

async function seedVault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opn-idx-"));
  await mkdir(join(root, "Alpha"), { recursive: true });
  await mkdir(join(root, "Beta"), { recursive: true });
  await writeFile(join(root, "Alpha", "index.md"), `---\ntitle: Alpha\n---\nLinks to [[Beta]]`);
  await writeFile(join(root, "Beta", "index.md"), `---\ntitle: Beta\ntags: [x]\n---\nbeta content`);
  return root;
}

test("reindexVault indexes pages, resolves links, and prunes deletions", async () => {
  await withTestDb(async (sql) => {
    const root = await seedVault();
    const r1 = await reindexVault(sql, root, NOW);
    expect(r1.indexed).toBe(2);

    const alpha = await getPageByPath(sql, "Alpha");
    const beta = await getPageByPath(sql, "Beta");
    expect(alpha).not.toBeNull();
    expect(beta?.tags).toEqual(["x"]);
    expect(await getBacklinks(sql, beta!.id)).toEqual([{ srcId: alpha!.id }]);

    await rm(join(root, "Beta"), { recursive: true, force: true });
    const r2 = await reindexVault(sql, root, NOW);
    expect(r2.removed).toBe(1);
    expect(await getPageByPath(sql, "Beta")).toBeNull();
  });
});
