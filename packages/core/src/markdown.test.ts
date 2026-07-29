import { expect, test } from "vitest";
import { extractHeadings, parseMarkdown, slugify } from "./index.js";

test("extracts headings with depth and slug", () => {
  const tree = parseMarkdown("# Hello World\n\ntext\n\n## Sub Section");
  const headings = extractHeadings(tree);
  expect(headings).toEqual([
    { depth: 1, text: "Hello World", slug: "hello-world" },
    { depth: 2, text: "Sub Section", slug: "sub-section" },
  ]);
});

test("slugify lowercases and hyphenates", () => {
  expect(slugify("A B! C")).toBe("a-b-c");
});
