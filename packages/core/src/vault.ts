import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, sep } from "node:path";
import { parsePage } from "./parsePage.js";
import { serializeFile } from "./frontmatter.js";
import type { PageNode } from "./types.js";

function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

async function hasIndex(dir: string): Promise<boolean> {
  try {
    await readFile(join(dir, "index.md"), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function nearestParentPath(vaultRoot: string, absDir: string): Promise<string | null> {
  let cur = dirname(absDir);
  while (cur.startsWith(vaultRoot) && cur !== vaultRoot) {
    if (await hasIndex(cur)) return toPosix(relative(vaultRoot, cur));
    cur = dirname(cur);
  }
  return null;
}

export async function pathToNode(
  vaultRoot: string,
  absDir: string,
  now: string,
): Promise<{ node: PageNode; idWasGenerated: boolean } | null> {
  let raw: string;
  try {
    raw = await readFile(join(absDir, "index.md"), "utf8");
  } catch {
    return null;
  }

  const { page, idWasGenerated } = parsePage(raw, now);
  const rel = toPosix(relative(vaultRoot, absDir));

  const node: PageNode = {
    id: page.frontmatter.id,
    path: rel,
    title: page.frontmatter.title,
    parentPath: await nearestParentPath(vaultRoot, absDir),
    frontmatter: page.frontmatter,
    body: page.body,
    tags: page.tags,
  };

  return { node, idWasGenerated };
}

export async function walkVault(vaultRoot: string, now: string): Promise<PageNode[]> {
  const out: PageNode[] = [];

  async function recurse(absDir: string): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".")) continue;
      const child = join(absDir, e.name);
      const parsed = await pathToNode(vaultRoot, child, now);
      if (parsed) out.push(parsed.node);
      await recurse(child);
    }
  }

  await recurse(vaultRoot);
  return out;
}

export async function writeIdBack(vaultRoot: string, node: PageNode): Promise<void> {
  const abs = join(vaultRoot, ...node.path.split(posix.sep), "index.md");
  await writeFile(abs, serializeFile(node.frontmatter, node.body), "utf8");
}
