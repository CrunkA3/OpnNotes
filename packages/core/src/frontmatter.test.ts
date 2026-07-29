import { expect, test } from "vitest";
import { ULID_REGEX, parseFile, serializeFile } from "./index.js";

const NOW = "2026-07-29T12:00:00Z";

test("parses valid frontmatter and strips it from body", () => {
  const raw = `---\nid: 01J8ZC7Q9V3K7M2F0X4RABCDEF\ntitle: Hello\ntags: [a]\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-01T00:00:00Z\n---\n\n# Body\n`;
  const { frontmatter, body, idWasGenerated } = parseFile(raw, NOW);
  expect(frontmatter.title).toBe("Hello");
  expect(frontmatter.tags).toEqual(["a"]);
  expect(idWasGenerated).toBe(false);
  expect(body.trim()).toBe("# Body");
});

test("generates id/created/updated when missing", () => {
  const raw = `---\ntitle: NoId\n---\ncontent`;
  const { frontmatter, idWasGenerated } = parseFile(raw, NOW);
  expect(ULID_REGEX.test(frontmatter.id)).toBe(true);
  expect(idWasGenerated).toBe(true);
  expect(frontmatter.created).toBe(NOW);
  expect(frontmatter.updated).toBe(NOW);
  expect(frontmatter.tags).toEqual([]);
  expect(frontmatter.aliases).toEqual([]);
});

test("handles a file with no frontmatter block at all", () => {
  const { frontmatter, body } = parseFile("just text", NOW);
  expect(ULID_REGEX.test(frontmatter.id)).toBe(true);
  expect(body).toBe("just text");
});

test("preserves foreign keys through round-trip", () => {
  const raw = `---\nid: 01J8ZC7Q9V3K7M2F0X4RABCDEF\ntitle: T\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-01T00:00:00Z\ncssclass: wide\n---\nx`;
  const { frontmatter, body } = parseFile(raw, NOW);
  const out = serializeFile(frontmatter, body);
  expect(out).toContain("cssclass: wide");
  const reparsed = parseFile(out, NOW);
  expect(reparsed.frontmatter.cssclass).toBe("wide");
});
