import { dirname, relative, resolve } from "node:path";
import type { Sql } from "@opnnotes/db";
import chokidar from "chokidar";
import { reindexPage, removePageByPath } from "./reindexPage.js";

type NowArg = string | (() => string);
const nowStr = (n: NowArg): string => (typeof n === "function" ? n() : n);

export function createWatcher(
  sql: Sql,
  vaultRoot: string,
  now: NowArg,
  opts?: { debounceMs?: number },
): { close(): Promise<void>; ready: Promise<void> } {
  const debounceMs = opts?.debounceMs ?? 150;
  const timers = new Map<string, NodeJS.Timeout>();

  const watcher = chokidar.watch("**/index.md", {
    cwd: vaultRoot,
    ignored: /(^|[\\/])\../,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  const schedule = (relFile: string, fn: () => Promise<void>) => {
    const existing = timers.get(relFile);
    if (existing) clearTimeout(existing);

    timers.set(
      relFile,
      setTimeout(() => {
        timers.delete(relFile);
        void fn().catch((err) => console.error("[indexer]", relFile, err));
      }, debounceMs),
    );
  };

  watcher.on("add", (rel) =>
    schedule(rel, () => reindexPage(sql, vaultRoot, resolve(vaultRoot, dirname(rel)), nowStr(now)).then(() => {})),
  );
  watcher.on("change", (rel) =>
    schedule(rel, () => reindexPage(sql, vaultRoot, resolve(vaultRoot, dirname(rel)), nowStr(now)).then(() => {})),
  );
  watcher.on("unlink", (rel) => schedule(rel, () => removePageByPath(sql, relative(".", dirname(rel)))));

  const ready = new Promise<void>((res) => watcher.on("ready", () => res()));

  return {
    ready,
    async close() {
      for (const t of timers.values()) clearTimeout(t);
      await watcher.close();
    },
  };
}
