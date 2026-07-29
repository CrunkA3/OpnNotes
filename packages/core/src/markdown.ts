import type { Root } from "mdast";
import { toString as mdToString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified, type Processor } from "unified";
import { visit } from "unist-util-visit";
import type { Heading } from "./types.js";

let processor: Processor | undefined;

export function getProcessor(): Processor {
  if (!processor) {
    processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm) as unknown as Processor;
  }
  return processor;
}

export function parseMarkdown(body: string): Root {
  return getProcessor().parse(body) as Root;
}

export function extractHeadings(tree: Root): Heading[] {
  const headings: Heading[] = [];
  visit(tree, "heading", (node) => {
    const text = mdToString(node);
    headings.push({ depth: node.depth, text, slug: slugify(text) });
  });
  return headings;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
