import type { Sql } from "./client.js";

export interface PageRow {
  id: string;
  path: string;
  title: string;
  tags: string[];
  contentHash: string;
}

export interface UpsertPageInput {
  id: string;
  path: string;
  title: string;
  tags: string[];
  aliases: string[];
  createdAt: string;
  updatedAt: string;
  contentHash: string;
  ftsText: string;
}

export async function upsertPage(sql: Sql, input: UpsertPageInput): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO pages (id, path, title, tags, aliases, created_at, updated_at, content_hash, indexed_at)
      VALUES (${input.id}, ${input.path}, ${input.title}, ${input.tags}, ${input.aliases},
              ${input.createdAt}, ${input.updatedAt}, ${input.contentHash}, now())
      ON CONFLICT (id) DO UPDATE SET
        path = EXCLUDED.path, title = EXCLUDED.title, tags = EXCLUDED.tags,
        aliases = EXCLUDED.aliases, created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at, content_hash = EXCLUDED.content_hash,
        indexed_at = now()`;

    await tx`
      INSERT INTO page_fts (page_id, tsv)
      VALUES (${input.id}, to_tsvector('english', ${input.ftsText}))
      ON CONFLICT (page_id) DO UPDATE SET tsv = EXCLUDED.tsv`;
  });
}

export async function deletePageById(sql: Sql, id: string): Promise<void> {
  await sql`DELETE FROM pages WHERE id = ${id}`;
}

export async function getPageById(sql: Sql, id: string): Promise<PageRow | null> {
  const rows = await sql<PageRow[]>`
    SELECT id, path, title, tags, content_hash AS "contentHash" FROM pages WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function getPageByPath(sql: Sql, path: string): Promise<PageRow | null> {
  const rows = await sql<PageRow[]>`
    SELECT id, path, title, tags, content_hash AS "contentHash" FROM pages WHERE path = ${path}`;
  return rows[0] ?? null;
}
