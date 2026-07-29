import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { parseMarkdown } from "./markdown.js";

const TAG_RE = /(?:^|\s)#([A-Za-z][\w-]*)/g;

export function extractInlineTags(body: string): string[] {
  const tree: Root = parseMarkdown(body);
  const found = new Set<string>();
  const order: string[] = [];

  visit(tree, (node) => {
    if (node.type === "inlineCode" || node.type === "code") return "skip";
    if (node.type !== "text") return;

    const value = (node as { value: string }).value;
    for (const m of value.matchAll(TAG_RE)) {
      const tag = m[1]!;
      if (!found.has(tag)) {
        found.add(tag);
        order.push(tag);
      }
    }
    return;
  });

  return order;
}

export function mergeTags(frontmatterTags: string[], inlineTags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const t of [...frontmatterTags, ...inlineTags]) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }

  return out;
}
