import matter from "gray-matter";
import { isValidId, newId } from "./ids.js";
import type { Frontmatter } from "./types.js";

export function parseFile(
  raw: string,
  now: string,
): { frontmatter: Frontmatter; body: string; idWasGenerated: boolean } {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const idWasGenerated = !isValidId(data.id);
  const id = isValidId(data.id) ? data.id : newId();

  const frontmatter: Frontmatter = {
    ...data,
    id,
    title: typeof data.title === "string" && data.title.length > 0 ? data.title : "Untitled",
    tags: normalizeStringArray(data.tags),
    aliases: normalizeStringArray(data.aliases),
    created: typeof data.created === "string" ? data.created : now,
    updated: typeof data.updated === "string" ? data.updated : now,
  };

  return { frontmatter, body: parsed.content.replace(/^\n/, ""), idWasGenerated };
}

export function serializeFile(frontmatter: Frontmatter, body: string): string {
  return matter.stringify(body, frontmatter);
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}
