import type { Sql } from "./client.js";

export interface SearchHit {
  id: string;
  path: string;
  title: string;
  rank: number;
}

export async function keywordSearch(sql: Sql, query: string, limit = 20): Promise<SearchHit[]> {
  return sql<SearchHit[]>`
    SELECT p.id, p.path, p.title,
           ts_rank(f.tsv, plainto_tsquery('english', ${query})) AS rank
    FROM page_fts f
    JOIN pages p ON p.id = f.page_id
    WHERE f.tsv @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}`;
}
