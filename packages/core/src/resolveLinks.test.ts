import { expect, test } from "vitest";
import type { PageNode } from "./index.js";
import { buildLinkIndex, resolveTarget } from "./index.js";

function node(id: string, path: string, title: string, aliases: string[] = []): PageNode {
  return {
    id,
    path,
    title,
    parentPath: null,
    frontmatter: { id, title, tags: [], aliases, created: "", updated: "" },
    body: "",
  };
}

test("resolves by title case-insensitively", () => {
  const idx = buildLinkIndex([node("A".repeat(26), "Foo", "Foo Page")]);
  expect(resolveTarget(idx, "Bar", "foo page")).toBe("A".repeat(26));
});

test("resolves by alias", () => {
  const idx = buildLinkIndex([node("B".repeat(26), "Foo", "Foo Page", ["FP"])]);
  expect(resolveTarget(idx, "Bar", "FP")).toBe("B".repeat(26));
});

test("duplicate titles resolve to nearest in tree", () => {
  const idx = buildLinkIndex([
    node("C".repeat(26), "Area1/Target", "Target"),
    node("D".repeat(26), "Area2/Target", "Target"),
  ]);
  expect(resolveTarget(idx, "Area2/Note", "Target")).toBe("D".repeat(26));
});

test("returns null for unknown target", () => {
  const idx = buildLinkIndex([]);
  expect(resolveTarget(idx, "X", "Nope")).toBeNull();
});
