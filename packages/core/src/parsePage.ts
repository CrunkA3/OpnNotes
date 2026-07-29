import { parseFile } from "./frontmatter.js";
import { extractWikiLinks } from "./links.js";
import { extractHeadings, parseMarkdown } from "./markdown.js";
import { extractInlineTags, mergeTags } from "./tags.js";
import type { ParsedPage } from "./types.js";

export function parsePage(
  raw: string,
  now: string,
): { page: ParsedPage; idWasGenerated: boolean } {
  const { frontmatter, body, idWasGenerated } = parseFile(raw, now);
  const tree = parseMarkdown(body);

  const page: ParsedPage = {
    frontmatter,
    body,
    headings: extractHeadings(tree),
    wikiLinks: extractWikiLinks(body),
    tags: mergeTags(frontmatter.tags, extractInlineTags(body)),
  };

  return { page, idWasGenerated };
}
