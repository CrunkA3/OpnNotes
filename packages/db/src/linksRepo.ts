import type { Sql } from "./client.js";

export interface LinkInput {
  dstId: string | null;
  rawTarget: string;
  display?: string;
  anchor?: string;
}

export async function replaceLinks(sql: Sql, srcId: string, links: LinkInput[]): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM links WHERE src_page_id = ${srcId}`;
    for (const l of links) {
      await tx`
        INSERT INTO links (src_page_id, dst_page_id, raw_target, display, anchor)
        VALUES (${srcId}, ${l.dstId}, ${l.rawTarget}, ${l.display ?? null}, ${l.anchor ?? null})`;
    }
  });
}

export async function getBacklinks(sql: Sql, dstId: string): Promise<{ srcId: string }[]> {
  const rows = await sql<{ srcId: string }[]>`
    SELECT DISTINCT src_page_id AS "srcId" FROM links WHERE dst_page_id = ${dstId} ORDER BY "srcId"`;
  return rows;
}
