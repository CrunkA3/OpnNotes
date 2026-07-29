import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { buildLinkIndex, extractWikiLinks, pathToNode, resolvePageLinks, walkVault, writeIdBack } from "@opnnotes/core";
import { deletePageById, getPageByPath, replaceLinks, upsertPage, type Sql } from "@opnnotes/db";
import { contentHash } from "./contentHash.js";

export async function reindexPage(
  sql: Sql,
  vaultRoot: string,
  absDir: string,
  now: string,
): Promise<"indexed" | "skipped"> {
  const parsed = await pathToNode(vaultRoot, absDir, now);
  if (!parsed) return "skipped";

  const node = parsed.node;
  const raw = await readFile(join(absDir, "index.md"), "utf8");

  if (!raw.includes(`id: ${node.id}`)) await writeIdBack(vaultRoot, node);

  await upsertPage(sql, {
    id: node.id,
    path: node.path,
    title: node.title,
    tags: node.frontmatter.tags,
    aliases: node.frontmatter.aliases,
    createdAt: node.frontmatter.created,
    updatedAt: node.frontmatter.updated,
    contentHash: contentHash(raw),
    ftsText: `${node.title}\n${node.body}`,
  });

  const index = buildLinkIndex(await walkVault(vaultRoot, now));
  const resolved = resolvePageLinks(node, extractWikiLinks(node.body), index);
  await replaceLinks(
    sql,
    node.id,
    resolved.map((r) => ({ dstId: r.dstId, rawTarget: r.rawTarget, display: r.display, anchor: r.anchor })),
  );

  return "indexed";
}

export async function removePageByPath(sql: Sql, relPath: string): Promise<void> {
  const posixPath = relPath.split(/[\\/]/).join(posix.sep);
  const row = await getPageByPath(sql, posixPath);
  if (row) await deletePageById(sql, row.id);
}
