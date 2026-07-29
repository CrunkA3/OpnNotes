import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { buildLinkIndex, extractWikiLinks, resolvePageLinks, walkVault, writeIdBack } from "@opnnotes/core";
import { deletePageById, replaceLinks, upsertPage, type Sql } from "@opnnotes/db";
import { contentHash } from "./contentHash.js";

export async function reindexVault(
  sql: Sql,
  vaultRoot: string,
  now: string,
): Promise<{ indexed: number; removed: number }> {
  const nodes = await walkVault(vaultRoot, now);
  const index = buildLinkIndex(nodes);
  const resolvedByPage = new Map<
    string,
    ReturnType<typeof resolvePageLinks>
  >();

  for (const node of nodes) {
    const abs = join(vaultRoot, ...node.path.split(posix.sep), "index.md");
    let raw = await readFile(abs, "utf8");
    if (!raw.includes(`id: ${node.id}`)) {
      await writeIdBack(vaultRoot, node);
      raw = await readFile(abs, "utf8");
    }

    await upsertPage(sql, {
      id: node.id,
      path: node.path,
      title: node.title,
      tags: node.tags,
      aliases: node.frontmatter.aliases,
      createdAt: node.frontmatter.created,
      updatedAt: node.frontmatter.updated,
      contentHash: contentHash(raw),
      ftsText: `${node.title}\n${node.body}`,
    });
    resolvedByPage.set(node.id, resolvePageLinks(node, extractWikiLinks(node.body), index));
  }

  for (const node of nodes) {
    const resolved = resolvedByPage.get(node.id) ?? [];
    await replaceLinks(
      sql,
      node.id,
      resolved.map((r) => ({
        dstId: r.dstId,
        rawTarget: r.rawTarget,
        display: r.display,
        anchor: r.anchor,
      })),
    );
  }

  const livePaths = new Set(nodes.map((n) => n.path));
  const dbPages = await sql<{ id: string; path: string }[]>`SELECT id, path FROM pages`;
  let removed = 0;

  for (const p of dbPages) {
    if (!livePaths.has(p.path)) {
      await deletePageById(sql, p.id);
      removed++;
    }
  }

  return { indexed: nodes.length, removed };
}
