import { expect, test } from "vitest";
import type { Frontmatter } from "./index.js";

test("Frontmatter type accepts foreign keys", () => {
  const fm: Frontmatter = {
    id: "01J8ZC7Q9V3K7M2F0X4RABCDEF",
    title: "T",
    tags: [],
    aliases: [],
    created: "2026-07-29T00:00:00Z",
    updated: "2026-07-29T00:00:00Z",
    obsidianKey: "kept",
  };
  expect(fm.obsidianKey).toBe("kept");
});
