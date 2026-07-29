import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPageByPath, withTestDb } from "@opnnotes/db";
import { expect, test } from "vitest";
import { createWatcher } from "./watcher.js";

const NOW = () => "2026-07-29T12:00:00Z";

function waitFor<T>(fn: () => Promise<T | null>, ms = 10_000): Promise<T> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      const v = await fn();
      if (v) return resolve(v);
      if (Date.now() - start > ms) return reject(new Error("timeout"));
      setTimeout(tick, 100);
    };
    void tick();
  });
}

test("watcher indexes new pages and removes deleted ones", async () => {
  await withTestDb(async (sql) => {
    const root = await mkdtemp(join(tmpdir(), "opn-watch-"));
    const w = createWatcher(sql, root, NOW);
    await w.ready;

    await mkdir(join(root, "Note"), { recursive: true });
    await writeFile(join(root, "Note", "index.md"), `---\ntitle: Note\n---\nhi`);
    const row = await waitFor(() => getPageByPath(sql, "Note"));
    expect(row.title).toBe("Note");

    await rm(join(root, "Note"), { recursive: true, force: true });
    await waitFor(async () => ((await getPageByPath(sql, "Note")) === null ? true : null));

    await w.close();
  });
});
