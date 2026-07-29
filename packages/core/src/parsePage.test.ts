import { expect, test } from "vitest";
import { parsePage } from "./index.js";

const NOW = "2026-07-29T12:00:00Z";

test("parsePage produces a complete ParsedPage", () => {
  const raw = `---\nid: 01J8ZC7Q9V3K7M2F0X4RABCDEF\ntitle: Demo\ntags: [alpha]\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-01T00:00:00Z\n---\n# Head\n\nLink to [[Other]] and a #beta tag.`;
  const { page } = parsePage(raw, NOW);
  expect(page.frontmatter.title).toBe("Demo");
  expect(page.headings[0]).toEqual({ depth: 1, text: "Head", slug: "head" });
  expect(page.wikiLinks).toEqual([{ rawTarget: "Other" }]);
  expect(page.tags).toEqual(["alpha", "beta"]);
});
