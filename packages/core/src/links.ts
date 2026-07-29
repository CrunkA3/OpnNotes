import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { parseMarkdown } from "./markdown.js";
import type { WikiLink } from "./types.js";

const WIKI_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export function extractWikiLinks(body: string): WikiLink[] {
  const tree: Root = parseMarkdown(body);
  const links: WikiLink[] = [];

  visit(tree, (node) => {
    if (node.type === "inlineCode" || node.type === "code") return "skip";
    if (node.type !== "text") return;

    const value = (node as { value: string }).value;
    for (const m of value.matchAll(WIKI_RE)) {
      const link: WikiLink = { rawTarget: m[1]!.trim() };
      if (m[2]) link.anchor = m[2].trim();
      if (m[3]) link.display = m[3].trim();
      links.push(link);
    }
    return;
  });

  return links;
}
