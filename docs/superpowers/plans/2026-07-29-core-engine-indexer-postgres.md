# Core Engine + Indexer + Postgres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the OpnNotes foundation: a `core` package that models the markdown vault (frontmatter, ULIDs, wiki-links, tags, hierarchy), a Postgres cache layer, and a file-watcher + re-index pipeline that reconciles vault changes into that cache with full-text search.

**Architecture:** A pnpm monorepo with three packages. `@opnnotes/core` is pure/testable logic over files (parse, ids, links, tags, vault walk, link resolution) with no I/O beyond reading a vault folder. `@opnnotes/db` owns the Postgres schema, migrations, and repositories for the rebuildable cache tables. `@opnnotes/indexer` wires a chokidar watcher and a re-index pipeline that turns file changes into DB writes. Markdown files remain the sole source of truth; every DB table in this plan is a rebuildable cache.

**Tech Stack:** TypeScript (ESM, `NodeNext`), pnpm workspaces, Vitest, unified/remark (remark-parse, remark-frontmatter, remark-gfm), unist-util-visit, gray-matter, zod, ulid, chokidar, `postgres` (porsager), Testcontainers (`@testcontainers/postgresql`, `pgvector/pgvector:pg16` image).

## Global Constraints

- **Language/runtime:** TypeScript, ESM only, module resolution `NodeNext`, target Node 20+. Copied verbatim from spec: "TypeScript end-to-end."
- **Files are truth:** Every table created in this plan is a rebuildable **cache**. No note content or structure may originate in the DB. The only file mutation permitted anywhere is writing a generated `id` into an `index.md` that lacks one (spec: data-model-and-filesystem.md).
- **Page identity:** `id` is a **ULID** — 26 chars, Crockford base32, regex `^[0-9A-HJKMNP-TV-Z]{26}$` (spec: data-model-and-filesystem.md, api.md).
- **Hierarchy source:** parent/child is folder nesting only. There is **no** `parent` field in frontmatter (spec: data-model-and-filesystem.md).
- **Frontmatter foreign keys:** unknown frontmatter keys are **preserved** on write, never dropped (`additionalProperties: true`, spec: api.md).
- **Tags:** merged from frontmatter `tags` **and** inline `#hashtags` (spec: data-model-and-filesystem.md).
- **Commit discipline:** TDD (red → green), one deliverable per task, commit at the end of each task. Conventional Commit messages.
- **Test DB:** integration tests use a real Postgres via Testcontainers (`pgvector/pgvector:pg16`); never mock SQL for repository tests.

---

### Task 1: Monorepo scaffold, tooling, and shared types

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/types.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the shared types every later task imports:
  - `Frontmatter` — `{ id: string; title: string; tags: string[]; aliases: string[]; created: string; updated: string; [k: string]: unknown }`
  - `Heading` — `{ depth: number; text: string; slug: string }`
  - `WikiLink` — `{ rawTarget: string; display?: string; anchor?: string }`
  - `ParsedPage` — `{ frontmatter: Frontmatter; body: string; headings: Heading[]; wikiLinks: WikiLink[]; tags: string[] }`
  - `PageNode` — `{ id: string; path: string; title: string; parentPath: string | null; frontmatter: Frontmatter; body: string }`
  - `ResolvedLink` — `{ srcId: string; rawTarget: string; display?: string; anchor?: string; dstId: string | null }`

- [ ] **Step 1: Create the root workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

Root `package.json`:
```json
{
  "name": "opnnotes",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    testTimeout: 120_000, // Testcontainers startup headroom
  },
});
```

`.gitignore`:
```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 2: Create the `core` package**

`packages/core/package.json`:
```json
{
  "name": "@opnnotes/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "remark-frontmatter": "^5.0.0",
    "remark-gfm": "^4.0.0",
    "remark-parse": "^11.0.0",
    "ulid": "^2.3.0",
    "unified": "^11.0.0",
    "unist-util-visit": "^5.0.0",
    "zod": "^3.23.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the shared types**

`packages/core/src/types.ts`:
```ts
export interface Frontmatter {
  id: string;
  title: string;
  tags: string[];
  aliases: string[];
  created: string; // RFC 3339
  updated: string; // RFC 3339
  [key: string]: unknown; // foreign keys preserved
}

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

export interface WikiLink {
  rawTarget: string; // title portion, e.g. "Other Page"
  display?: string; // text after |
  anchor?: string; // text after #
}

export interface ParsedPage {
  frontmatter: Frontmatter;
  body: string; // markdown without the frontmatter block
  headings: Heading[];
  wikiLinks: WikiLink[];
  tags: string[]; // merged frontmatter + inline
}

export interface PageNode {
  id: string;
  path: string; // folder path relative to vault root, POSIX separators
  title: string;
  parentPath: string | null;
  frontmatter: Frontmatter;
  body: string;
}

export interface ResolvedLink {
  srcId: string;
  rawTarget: string;
  display?: string;
  anchor?: string;
  dstId: string | null; // null = unresolved
}
```

`packages/core/src/index.ts`:
```ts
export * from "./types.js";
```

- [ ] **Step 4: Write the failing smoke test**

`packages/core/src/types.test.ts`:
```ts
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
```

- [ ] **Step 5: Install deps, run test, confirm pass**

Run: `pnpm install && pnpm test`
Expected: install succeeds; the smoke test PASSES.

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold pnpm monorepo, core package, and shared types"
```

---

### Task 2: ULID ids module

**Files:**
- Create: `packages/core/src/ids.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./ids.js";`)
- Test: `packages/core/src/ids.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ULID_REGEX: RegExp`
  - `newId(): string` — generates a fresh ULID
  - `isValidId(value: unknown): value is string`

- [ ] **Step 1: Write the failing test**

`packages/core/src/ids.test.ts`:
```ts
import { expect, test } from "vitest";
import { ULID_REGEX, isValidId, newId } from "./index.js";

test("newId produces a valid 26-char ULID", () => {
  const id = newId();
  expect(id).toHaveLength(26);
  expect(ULID_REGEX.test(id)).toBe(true);
});

test("isValidId rejects garbage and accepts real ids", () => {
  expect(isValidId("nope")).toBe(false);
  expect(isValidId(123)).toBe(false);
  expect(isValidId(newId())).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/ids.test.ts`
Expected: FAIL — `isValidId`/`newId`/`ULID_REGEX` not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/ids.ts`:
```ts
import { ulid } from "ulid";

// Crockford base32, excludes I L O U
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function newId(): string {
  return ulid();
}

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && ULID_REGEX.test(value);
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./ids.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/ids.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ids.ts packages/core/src/ids.test.ts packages/core/src/index.ts
git commit -m "feat(core): add ULID id generation and validation"
```

---

### Task 3: Frontmatter parse / serialize with schema and id-ensure

**Files:**
- Create: `packages/core/src/frontmatter.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/frontmatter.test.ts`

**Interfaces:**
- Consumes: `newId`, `isValidId` (Task 2); `Frontmatter` (Task 1).
- Produces:
  - `parseFile(raw: string, now: string): { frontmatter: Frontmatter; body: string; idWasGenerated: boolean }` — splits an `index.md`, validates/normalizes frontmatter, generates `id` if missing and normalizes `created`/`updated` defaults using the supplied `now` (RFC 3339). `now` is injected (never `Date.now()` inside core) so tests are deterministic.
  - `serializeFile(frontmatter: Frontmatter, body: string): string` — reassembles `index.md`, preserving foreign keys.

- [ ] **Step 1: Write the failing test**

`packages/core/src/frontmatter.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/frontmatter.test.ts`
Expected: FAIL — `parseFile`/`serializeFile` not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/frontmatter.ts`:
```ts
import matter from "gray-matter";
import type { Frontmatter } from "./types.js";
import { isValidId, newId } from "./ids.js";

export function parseFile(
  raw: string,
  now: string,
): { frontmatter: Frontmatter; body: string; idWasGenerated: boolean } {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const idWasGenerated = !isValidId(data.id);
  const id = isValidId(data.id) ? (data.id as string) : newId();

  const frontmatter: Frontmatter = {
    ...data,
    id,
    title:
      typeof data.title === "string" && data.title.length > 0
        ? data.title
        : "Untitled",
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
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./frontmatter.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/frontmatter.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/frontmatter.ts packages/core/src/frontmatter.test.ts packages/core/src/index.ts
git commit -m "feat(core): parse/serialize frontmatter with id-ensure and foreign-key preservation"
```

---

### Task 4: Markdown parsing and heading extraction

**Files:**
- Create: `packages/core/src/markdown.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/markdown.test.ts`

**Interfaces:**
- Consumes: `Heading` (Task 1).
- Produces:
  - `getProcessor(): Processor` — a memoized unified processor (remark-parse + remark-frontmatter + remark-gfm).
  - `parseMarkdown(body: string): Root` — returns the mdast `Root`.
  - `extractHeadings(tree: Root): Heading[]` — depth, text, GitHub-style slug.
  - `slugify(text: string): string`

- [ ] **Step 1: Write the failing test**

`packages/core/src/markdown.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/markdown.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/markdown.ts`:
```ts
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified, type Processor } from "unified";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { toString as mdToString } from "mdast-util-to-string";
import type { Heading } from "./types.js";

let processor: Processor | undefined;

export function getProcessor(): Processor {
  if (!processor) {
    processor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml"])
      .use(remarkGfm) as unknown as Processor;
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
```

Add deps to `packages/core/package.json` dependencies:
```json
"mdast-util-to-string": "^4.0.0"
```
and devDependencies (mdast types):
```json
"@types/mdast": "^4.0.0"
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./markdown.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm vitest run packages/core/src/markdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/markdown.ts packages/core/src/markdown.test.ts packages/core/src/index.ts packages/core/package.json
git commit -m "feat(core): add markdown processor and heading extraction"
```

---

### Task 5: Wiki-link extraction

**Files:**
- Create: `packages/core/src/links.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/links.test.ts`

**Interfaces:**
- Consumes: `WikiLink` (Task 1); `parseMarkdown` (Task 4).
- Produces:
  - `extractWikiLinks(body: string): WikiLink[]` — finds `[[Target]]`, `[[Target|display]]`, `[[Target#anchor]]`, `[[Target#anchor|display]]`, **ignoring** matches inside inline code and fenced code blocks.

- [ ] **Step 1: Write the failing test**

`packages/core/src/links.test.ts`:
```ts
import { expect, test } from "vitest";
import { extractWikiLinks } from "./index.js";

test("extracts plain, display, and anchor forms", () => {
  const body = "See [[Other Page]] and [[Other|shown]] and [[Doc#Heading]] and [[Doc#H|D]].";
  expect(extractWikiLinks(body)).toEqual([
    { rawTarget: "Other Page" },
    { rawTarget: "Other", display: "shown" },
    { rawTarget: "Doc", anchor: "Heading" },
    { rawTarget: "Doc", anchor: "H", display: "D" },
  ]);
});

test("ignores links inside inline and fenced code", () => {
  const body = "text `[[NotALink]]` more\n\n```\n[[AlsoNot]]\n```\n\n[[Real]]";
  expect(extractWikiLinks(body)).toEqual([{ rawTarget: "Real" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/links.test.ts`
Expected: FAIL — `extractWikiLinks` not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/links.ts`:
```ts
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { parseMarkdown } from "./markdown.js";
import type { WikiLink } from "./types.js";

const WIKI_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export function extractWikiLinks(body: string): WikiLink[] {
  const tree: Root = parseMarkdown(body);
  const links: WikiLink[] = [];

  visit(tree, (node) => {
    // Skip nodes whose text must not be scanned for links.
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
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./links.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/links.ts packages/core/src/links.test.ts packages/core/src/index.ts
git commit -m "feat(core): extract wiki-links, ignoring code spans and fences"
```

---

### Task 6: Tag extraction and merge

**Files:**
- Create: `packages/core/src/tags.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/tags.test.ts`

**Interfaces:**
- Consumes: `parseMarkdown` (Task 4).
- Produces:
  - `extractInlineTags(body: string): string[]` — `#hashtags` at word boundaries, not inside code, dedup, no leading `#`.
  - `mergeTags(frontmatterTags: string[], inlineTags: string[]): string[]` — union, order-stable, dedup.

- [ ] **Step 1: Write the failing test**

`packages/core/src/tags.test.ts`:
```ts
import { expect, test } from "vitest";
import { extractInlineTags, mergeTags } from "./index.js";

test("extracts inline hashtags, skipping code", () => {
  const body = "A #project note about #notes-app. `#nope` and\n```\n#alsonope\n```";
  expect(extractInlineTags(body)).toEqual(["project", "notes-app"]);
});

test("does not treat markdown headings as tags", () => {
  expect(extractInlineTags("# Heading\n\ntext")).toEqual([]);
});

test("mergeTags unions and dedups, preserving order", () => {
  expect(mergeTags(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/tags.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/tags.ts`:
```ts
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { parseMarkdown } from "./markdown.js";

// #tag: letters/digits/_/-/ /, must follow start or whitespace; excludes bare "#".
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
```

Note: heading text like `# Heading` is a `heading` node, not `text` starting with `#`, so it is naturally excluded.

Add to `packages/core/src/index.ts`:
```ts
export * from "./tags.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/tags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tags.ts packages/core/src/tags.test.ts packages/core/src/index.ts
git commit -m "feat(core): extract inline hashtags and merge with frontmatter tags"
```

---

### Task 7: ParsePage — combine into a single ParsedPage

**Files:**
- Create: `packages/core/src/parsePage.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/parsePage.test.ts`

**Interfaces:**
- Consumes: `parseFile` (Task 3), `extractHeadings`/`parseMarkdown` (Task 4), `extractWikiLinks` (Task 5), `extractInlineTags`/`mergeTags` (Task 6); `ParsedPage` (Task 1).
- Produces:
  - `parsePage(raw: string, now: string): { page: ParsedPage; idWasGenerated: boolean }` — one call that yields the fully-parsed page (frontmatter, body, headings, wikiLinks, merged tags).

- [ ] **Step 1: Write the failing test**

`packages/core/src/parsePage.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/parsePage.test.ts`
Expected: FAIL — `parsePage` not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/parsePage.ts`:
```ts
import { parseFile } from "./frontmatter.js";
import { extractHeadings, parseMarkdown } from "./markdown.js";
import { extractWikiLinks } from "./links.js";
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
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./parsePage.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/parsePage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/parsePage.ts packages/core/src/parsePage.test.ts packages/core/src/index.ts
git commit -m "feat(core): add parsePage combining frontmatter, headings, links, tags"
```

---

### Task 8: Vault walk — folder tree to PageNode list

**Files:**
- Create: `packages/core/src/vault.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/vault.test.ts`

**Interfaces:**
- Consumes: `parsePage` (Task 7), `serializeFile` (Task 3); `PageNode` (Task 1).
- Produces:
  - `pathToNode(vaultRoot, absDir, now): Promise<{ node: PageNode; idWasGenerated: boolean } | null>` — reads `<absDir>/index.md`, returns a `PageNode` whose `path` is POSIX-relative to `vaultRoot` and `parentPath` is the nearest ancestor dir that itself contains an `index.md` (or `null`). Returns `null` if the dir has no `index.md`.
  - `walkVault(vaultRoot, now): Promise<PageNode[]>` — all pages, dot-dirs ignored.
  - `writeIdBack(vaultRoot, node): Promise<void>` — rewrites `index.md` with the (now-populated) frontmatter. **The only permitted file mutation.**

- [ ] **Step 1: Write the failing test**

`packages/core/src/vault.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ULID_REGEX, walkVault, writeIdBack } from "./index.js";

const NOW = "2026-07-29T12:00:00Z";

async function makeVault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opn-"));
  await mkdir(join(root, "Projects", "OpnNotes"), { recursive: true });
  await writeFile(
    join(root, "Projects", "index.md"),
    `---\nid: 01J8ZC7Q9V3K7M2F0X4RABCDEF\ntitle: Projects\ncreated: ${NOW}\nupdated: ${NOW}\n---\n`,
  );
  await writeFile(
    join(root, "Projects", "OpnNotes", "index.md"),
    `---\ntitle: OpnNotes\n---\nchild body`, // no id -> generated
  );
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, ".git", "index.md"), "should be ignored");
  return root;
}

test("walkVault returns pages with hierarchy, ignoring dot-dirs", async () => {
  const root = await makeVault();
  const nodes = (await walkVault(root, NOW)).sort((a, b) => a.path.localeCompare(b.path));
  expect(nodes.map((n) => n.path)).toEqual(["Projects", "Projects/OpnNotes"]);
  const child = nodes.find((n) => n.path === "Projects/OpnNotes")!;
  expect(child.parentPath).toBe("Projects");
  expect(ULID_REGEX.test(child.id)).toBe(true);
});

test("writeIdBack persists a generated id into index.md", async () => {
  const root = await makeVault();
  const nodes = await walkVault(root, NOW);
  const child = nodes.find((n) => n.path === "Projects/OpnNotes")!;
  await writeIdBack(root, child);
  const raw = await readFile(join(root, "Projects", "OpnNotes", "index.md"), "utf8");
  expect(raw).toContain(`id: ${child.id}`);
  expect(raw).toContain("child body");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/vault.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/vault.ts`:
```ts
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep, posix, dirname } from "node:path";
import { parsePage } from "./parsePage.js";
import { serializeFile } from "./frontmatter.js";
import type { PageNode } from "./types.js";

function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

async function hasIndex(dir: string): Promise<boolean> {
  try {
    await readFile(join(dir, "index.md"), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function nearestParentPath(vaultRoot: string, absDir: string): Promise<string | null> {
  let cur = dirname(absDir);
  const rootAbs = vaultRoot;
  while (cur.startsWith(rootAbs) && cur !== rootAbs) {
    if (await hasIndex(cur)) return toPosix(relative(vaultRoot, cur));
    cur = dirname(cur);
  }
  return null;
}

export async function pathToNode(
  vaultRoot: string,
  absDir: string,
  now: string,
): Promise<{ node: PageNode; idWasGenerated: boolean } | null> {
  let raw: string;
  try {
    raw = await readFile(join(absDir, "index.md"), "utf8");
  } catch {
    return null;
  }
  const { page, idWasGenerated } = parsePage(raw, now);
  const node: PageNode = {
    id: page.frontmatter.id,
    path: toPosix(relative(vaultRoot, absDir)) || ".",
    title: page.frontmatter.title,
    parentPath: await nearestParentPath(vaultRoot, absDir),
    frontmatter: page.frontmatter,
    body: page.body,
  };
  return { node, idWasGenerated };
}

export async function walkVault(vaultRoot: string, now: string): Promise<PageNode[]> {
  const out: PageNode[] = [];
  async function recurse(absDir: string): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".")) continue;
      const child = join(absDir, e.name);
      const parsed = await pathToNode(vaultRoot, child, now);
      if (parsed) out.push(parsed.node);
      await recurse(child);
    }
  }
  await recurse(vaultRoot);
  return out;
}

export async function writeIdBack(vaultRoot: string, node: PageNode): Promise<void> {
  const abs = join(vaultRoot, ...node.path.split(posix.sep), "index.md");
  await writeFile(abs, serializeFile(node.frontmatter, node.body), "utf8");
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./vault.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/vault.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/vault.ts packages/core/src/vault.test.ts packages/core/src/index.ts
git commit -m "feat(core): walk vault into PageNodes and write generated ids back"
```

---

### Task 9: Link resolver — titles/aliases to ids, nearest-in-tree

**Files:**
- Create: `packages/core/src/resolveLinks.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/resolveLinks.test.ts`

**Interfaces:**
- Consumes: `PageNode`, `WikiLink`, `ResolvedLink` (Task 1); `extractWikiLinks` via node bodies (but resolver takes already-parsed data).
- Produces:
  - `buildLinkIndex(nodes: PageNode[]): LinkIndex` where `LinkIndex` maps a normalized title/alias to a list of `{ id, path }` candidates.
  - `resolveTarget(index: LinkIndex, srcPath: string, rawTarget: string): string | null` — case-insensitive title/alias match; on multiple candidates pick the one whose `path` shares the longest ancestor prefix with `srcPath`; `null` if none.
  - `resolvePageLinks(node: PageNode, links: WikiLink[], index: LinkIndex): ResolvedLink[]`

- [ ] **Step 1: Write the failing test**

`packages/core/src/resolveLinks.test.ts`:
```ts
import { expect, test } from "vitest";
import { buildLinkIndex, resolveTarget } from "./index.js";
import type { PageNode } from "./index.js";

function node(id: string, path: string, title: string, aliases: string[] = []): PageNode {
  return {
    id, path, title, parentPath: null,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/resolveLinks.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/resolveLinks.ts`:
```ts
import type { PageNode, ResolvedLink, WikiLink } from "./types.js";

interface Candidate {
  id: string;
  path: string;
}
export type LinkIndex = Map<string, Candidate[]>;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function buildLinkIndex(nodes: PageNode[]): LinkIndex {
  const index: LinkIndex = new Map();
  const add = (key: string, cand: Candidate) => {
    const list = index.get(key) ?? [];
    list.push(cand);
    index.set(key, list);
  };
  for (const n of nodes) {
    const cand: Candidate = { id: n.id, path: n.path };
    add(norm(n.title), cand);
    for (const alias of n.frontmatter.aliases) add(norm(alias), cand);
  }
  return index;
}

function commonPrefixLen(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  let i = 0;
  while (i < as.length && i < bs.length && as[i] === bs[i]) i++;
  return i;
}

export function resolveTarget(
  index: LinkIndex,
  srcPath: string,
  rawTarget: string,
): string | null {
  const candidates = index.get(norm(rawTarget));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!.id;
  let best = candidates[0]!;
  let bestScore = commonPrefixLen(srcPath, best.path);
  for (const c of candidates.slice(1)) {
    const score = commonPrefixLen(srcPath, c.path);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best.id;
}

export function resolvePageLinks(
  node: PageNode,
  links: WikiLink[],
  index: LinkIndex,
): ResolvedLink[] {
  return links.map((l) => ({
    srcId: node.id,
    rawTarget: l.rawTarget,
    display: l.display,
    anchor: l.anchor,
    dstId: resolveTarget(index, node.path, l.rawTarget),
  }));
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./resolveLinks.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/resolveLinks.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/resolveLinks.ts packages/core/src/resolveLinks.test.ts packages/core/src/index.ts
git commit -m "feat(core): resolve wiki-links to ids with nearest-in-tree disambiguation"
```

---

### Task 10: DB package — client, migration runner, initial schema

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/migrations/0001_init.sql`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/testHelper.ts`
- Test: `packages/db/src/migrate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `createClient(url: string): Sql` — a configured `postgres` client (aliased type `Sql`).
  - `migrate(sql: Sql): Promise<void>` — applies all `migrations/*.sql` in filename order, idempotently, tracked in a `_migrations` table.
  - `withTestDb(fn: (sql: Sql) => Promise<void>): Promise<void>` — (test helper) starts a `pgvector/pgvector:pg16` container, migrates, runs `fn`, tears down.
  - Schema (cache tables): `pages`, `page_fts`, `links`.

- [ ] **Step 1: Write the migration SQL**

`packages/db/migrations/0001_init.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE pages (
  id           text PRIMARY KEY,
  path         text NOT NULL UNIQUE,
  title        text NOT NULL,
  tags         text[] NOT NULL DEFAULT '{}',
  aliases      text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL,
  content_hash text NOT NULL,
  indexed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE page_fts (
  page_id text PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  tsv     tsvector NOT NULL
);
CREATE INDEX page_fts_tsv_idx ON page_fts USING GIN (tsv);

CREATE TABLE links (
  id          bigserial PRIMARY KEY,
  src_page_id text NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  dst_page_id text REFERENCES pages(id) ON DELETE SET NULL,
  raw_target  text NOT NULL,
  display     text,
  anchor      text
);
CREATE INDEX links_src_idx ON links(src_page_id);
CREATE INDEX links_dst_idx ON links(dst_page_id);
```

- [ ] **Step 2: Create the package files**

`packages/db/package.json`:
```json
{
  "name": "@opnnotes/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.9.0"
  }
}
```

`packages/db/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/db/src/client.ts`:
```ts
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createClient(url: string): Sql {
  return postgres(url, { onnotice: () => {} });
}
```

`packages/db/src/migrate.ts`:
```ts
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "./client.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(sql: Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const already = await sql`SELECT 1 FROM _migrations WHERE name = ${file}`;
    if (already.length > 0) continue;
    const ddl = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await sql.unsafe(ddl);
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  }
}
```

`packages/db/src/index.ts`:
```ts
export * from "./client.js";
export * from "./migrate.js";
```

`packages/db/src/testHelper.ts`:
```ts
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createClient, type Sql } from "./client.js";
import { migrate } from "./migrate.js";

export async function withTestDb(fn: (sql: Sql) => Promise<void>): Promise<void> {
  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const sql = createClient(container.getConnectionUri());
  try {
    await migrate(sql);
    await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
    await container.stop();
  }
}
```

- [ ] **Step 3: Write the failing test**

`packages/db/src/migrate.test.ts`:
```ts
import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";

test("migrate creates the cache tables and vector extension", async () => {
  await withTestDb(async (sql) => {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`;
    const names = tables.map((t) => t.table_name);
    expect(names).toContain("pages");
    expect(names).toContain("page_fts");
    expect(names).toContain("links");

    const ext = await sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`;
    expect(ext.length).toBe(1);

    // second migrate call is a no-op
    const { migrate } = await import("./migrate.js");
    await expect(migrate(sql)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `pnpm install`
Run: `pnpm vitest run packages/db/src/migrate.test.ts`
Expected first run before files exist: FAIL. After Steps 1–2 in place: PASS. (Requires Docker running for Testcontainers.)

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): postgres client, migration runner, and initial cache schema"
```

---

### Task 11: Pages repository — upsert, delete, get, with FTS

**Files:**
- Create: `packages/db/src/pagesRepo.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/pagesRepo.test.ts`

**Interfaces:**
- Consumes: `Sql` (Task 10).
- Produces:
  - `PageRow` — `{ id: string; path: string; title: string; tags: string[]; contentHash: string }`
  - `upsertPage(sql, input): Promise<void>` where `input` is `{ id; path; title; tags: string[]; aliases: string[]; createdAt: string; updatedAt: string; contentHash: string; ftsText: string }`. Writes `pages` and `page_fts` (via `to_tsvector('english', ftsText)`).
  - `deletePageById(sql, id): Promise<void>`
  - `getPageById(sql, id): Promise<PageRow | null>`
  - `getPageByPath(sql, path): Promise<PageRow | null>`

- [ ] **Step 1: Write the failing test**

`packages/db/src/pagesRepo.test.ts`:
```ts
import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";
import { deletePageById, getPageById, upsertPage } from "./pagesRepo.js";

const base = {
  id: "01J8ZC7Q9V3K7M2F0X4RABCDEF",
  path: "Projects/OpnNotes",
  title: "OpnNotes",
  tags: ["project"],
  aliases: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  contentHash: "hash1",
  ftsText: "OpnNotes markdown notes app",
};

test("upsert then get returns the row; upsert again updates it", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, base);
    let row = await getPageById(sql, base.id);
    expect(row?.title).toBe("OpnNotes");
    expect(row?.tags).toEqual(["project"]);

    await upsertPage(sql, { ...base, title: "Renamed", contentHash: "hash2" });
    row = await getPageById(sql, base.id);
    expect(row?.title).toBe("Renamed");
    expect(row?.contentHash).toBe("hash2");
  });
});

test("full-text search matches indexed content", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, base);
    const hits = await sql<{ page_id: string }[]>`
      SELECT page_id FROM page_fts WHERE tsv @@ plainto_tsquery('english', 'markdown')`;
    expect(hits.map((h) => h.page_id)).toEqual([base.id]);
  });
});

test("delete removes page and cascades fts", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, base);
    await deletePageById(sql, base.id);
    expect(await getPageById(sql, base.id)).toBeNull();
    const fts = await sql`SELECT 1 FROM page_fts WHERE page_id = ${base.id}`;
    expect(fts.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/db/src/pagesRepo.test.ts`
Expected: FAIL — repo functions not defined.

- [ ] **Step 3: Write the implementation**

`packages/db/src/pagesRepo.ts`:
```ts
import type { Sql } from "./client.js";

export interface PageRow {
  id: string;
  path: string;
  title: string;
  tags: string[];
  contentHash: string;
}

export interface UpsertPageInput {
  id: string;
  path: string;
  title: string;
  tags: string[];
  aliases: string[];
  createdAt: string;
  updatedAt: string;
  contentHash: string;
  ftsText: string;
}

export async function upsertPage(sql: Sql, input: UpsertPageInput): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO pages (id, path, title, tags, aliases, created_at, updated_at, content_hash, indexed_at)
      VALUES (${input.id}, ${input.path}, ${input.title}, ${input.tags}, ${input.aliases},
              ${input.createdAt}, ${input.updatedAt}, ${input.contentHash}, now())
      ON CONFLICT (id) DO UPDATE SET
        path = EXCLUDED.path, title = EXCLUDED.title, tags = EXCLUDED.tags,
        aliases = EXCLUDED.aliases, created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at, content_hash = EXCLUDED.content_hash,
        indexed_at = now()`;
    await tx`
      INSERT INTO page_fts (page_id, tsv)
      VALUES (${input.id}, to_tsvector('english', ${input.ftsText}))
      ON CONFLICT (page_id) DO UPDATE SET tsv = EXCLUDED.tsv`;
  });
}

export async function deletePageById(sql: Sql, id: string): Promise<void> {
  await sql`DELETE FROM pages WHERE id = ${id}`;
}

export async function getPageById(sql: Sql, id: string): Promise<PageRow | null> {
  const rows = await sql<PageRow[]>`
    SELECT id, path, title, tags, content_hash AS "contentHash" FROM pages WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function getPageByPath(sql: Sql, path: string): Promise<PageRow | null> {
  const rows = await sql<PageRow[]>`
    SELECT id, path, title, tags, content_hash AS "contentHash" FROM pages WHERE path = ${path}`;
  return rows[0] ?? null;
}
```

Add to `packages/db/src/index.ts`:
```ts
export * from "./pagesRepo.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/db/src/pagesRepo.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/pagesRepo.ts packages/db/src/pagesRepo.test.ts packages/db/src/index.ts
git commit -m "feat(db): pages repository with upsert/get/delete and full-text index"
```

---

### Task 12: Links repository — replace a page's outbound links

**Files:**
- Create: `packages/db/src/linksRepo.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/linksRepo.test.ts`

**Interfaces:**
- Consumes: `Sql` (Task 10); `upsertPage` (Task 11) in tests to satisfy FKs.
- Produces:
  - `LinkInput` — `{ dstId: string | null; rawTarget: string; display?: string; anchor?: string }`
  - `replaceLinks(sql, srcId: string, links: LinkInput[]): Promise<void>` — delete existing `links` for `srcId`, insert the new set (atomic).
  - `getBacklinks(sql, dstId: string): Promise<{ srcId: string }[]>`

- [ ] **Step 1: Write the failing test**

`packages/db/src/linksRepo.test.ts`:
```ts
import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";
import { upsertPage } from "./pagesRepo.js";
import { getBacklinks, replaceLinks } from "./linksRepo.js";

const A = "01J8ZC7Q9V3K7M2F0X4RAAAAAA";
const B = "01J8ZC7Q9V3K7M2F0X4RBBBBBB";

function page(id: string, path: string) {
  return {
    id, path, title: path, tags: [], aliases: [],
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    contentHash: "h", ftsText: path,
  };
}

test("replaceLinks stores links and backlinks resolve", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, page(A, "A"));
    await upsertPage(sql, page(B, "B"));
    await replaceLinks(sql, A, [{ dstId: B, rawTarget: "B", display: "to B" }]);
    expect(await getBacklinks(sql, B)).toEqual([{ srcId: A }]);
  });
});

test("replaceLinks overwrites the previous set", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, page(A, "A"));
    await upsertPage(sql, page(B, "B"));
    await replaceLinks(sql, A, [{ dstId: B, rawTarget: "B" }]);
    await replaceLinks(sql, A, [{ dstId: null, rawTarget: "Ghost" }]); // unresolved
    expect(await getBacklinks(sql, B)).toEqual([]);
    const all = await sql`SELECT raw_target FROM links WHERE src_page_id = ${A}`;
    expect(all.map((r) => r.raw_target)).toEqual(["Ghost"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/db/src/linksRepo.test.ts`
Expected: FAIL — repo functions not defined.

- [ ] **Step 3: Write the implementation**

`packages/db/src/linksRepo.ts`:
```ts
import type { Sql } from "./client.js";

export interface LinkInput {
  dstId: string | null;
  rawTarget: string;
  display?: string;
  anchor?: string;
}

export async function replaceLinks(sql: Sql, srcId: string, links: LinkInput[]): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM links WHERE src_page_id = ${srcId}`;
    for (const l of links) {
      await tx`
        INSERT INTO links (src_page_id, dst_page_id, raw_target, display, anchor)
        VALUES (${srcId}, ${l.dstId}, ${l.rawTarget}, ${l.display ?? null}, ${l.anchor ?? null})`;
    }
  });
}

export async function getBacklinks(sql: Sql, dstId: string): Promise<{ srcId: string }[]> {
  const rows = await sql<{ srcId: string }[]>`
    SELECT DISTINCT src_page_id AS "srcId" FROM links WHERE dst_page_id = ${dstId} ORDER BY "srcId"`;
  return rows;
}
```

Add to `packages/db/src/index.ts`:
```ts
export * from "./linksRepo.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/db/src/linksRepo.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/linksRepo.ts packages/db/src/linksRepo.test.ts packages/db/src/index.ts
git commit -m "feat(db): links repository with replace and backlinks"
```

---

### Task 13: Re-index pipeline — reconcile a vault snapshot into the DB

**Files:**
- Create: `packages/indexer/package.json`, `packages/indexer/tsconfig.json`
- Create: `packages/indexer/src/contentHash.ts`
- Create: `packages/indexer/src/reindex.ts`
- Create: `packages/indexer/src/index.ts`
- Test: `packages/indexer/src/reindex.test.ts`

**Interfaces:**
- Consumes: `@opnnotes/core` (`walkVault`, `writeIdBack`, `parsePage`, `buildLinkIndex`, `resolvePageLinks`, `extractWikiLinks`); `@opnnotes/db` (`upsertPage`, `replaceLinks`, `deletePageById`, `getPageByPath`, `Sql`, `withTestDb`).
- Produces:
  - `contentHash(raw: string): string` — stable sha256 hex of the raw file.
  - `reindexVault(sql, vaultRoot, now): Promise<{ indexed: number; removed: number }>` — full reconciliation: walk vault → for each page (writing back generated ids) upsert page + fts + resolved links; delete DB pages whose path no longer exists on disk.

- [ ] **Step 1: Create the package**

`packages/indexer/package.json`:
```json
{
  "name": "@opnnotes/indexer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@opnnotes/core": "workspace:*",
    "@opnnotes/db": "workspace:*",
    "chokidar": "^3.6.0"
  }
}
```

`packages/indexer/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/indexer/src/reindex.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { withTestDb, getPageByPath, getBacklinks } from "@opnnotes/db";
import { reindexVault } from "./reindex.js";

const NOW = "2026-07-29T12:00:00Z";

async function seedVault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opn-idx-"));
  await mkdir(join(root, "Alpha"), { recursive: true });
  await mkdir(join(root, "Beta"), { recursive: true });
  await writeFile(join(root, "Alpha", "index.md"),
    `---\ntitle: Alpha\n---\nLinks to [[Beta]]`); // no id -> generated + written back
  await writeFile(join(root, "Beta", "index.md"),
    `---\ntitle: Beta\ntags: [x]\n---\nbeta content`);
  return root;
}

test("reindexVault indexes pages, resolves links, and prunes deletions", async () => {
  await withTestDb(async (sql) => {
    const root = await seedVault();
    const r1 = await reindexVault(sql, root, NOW);
    expect(r1.indexed).toBe(2);

    const alpha = await getPageByPath(sql, "Alpha");
    const beta = await getPageByPath(sql, "Beta");
    expect(alpha).not.toBeNull();
    expect(beta?.tags).toEqual(["x"]);
    expect(await getBacklinks(sql, beta!.id)).toEqual([{ srcId: alpha!.id }]);

    // delete Beta on disk, reindex -> pruned
    await rm(join(root, "Beta"), { recursive: true, force: true });
    const r2 = await reindexVault(sql, root, NOW);
    expect(r2.removed).toBe(1);
    expect(await getPageByPath(sql, "Beta")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm install && pnpm vitest run packages/indexer/src/reindex.test.ts`
Expected: FAIL — `reindexVault` not defined.

- [ ] **Step 4: Write the implementation**

`packages/indexer/src/contentHash.ts`:
```ts
import { createHash } from "node:crypto";

export function contentHash(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
```

`packages/indexer/src/reindex.ts`:
```ts
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  buildLinkIndex,
  extractWikiLinks,
  resolvePageLinks,
  walkVault,
  writeIdBack,
} from "@opnnotes/core";
import {
  deletePageById,
  replaceLinks,
  upsertPage,
  type Sql,
} from "@opnnotes/db";
import { contentHash } from "./contentHash.js";

export async function reindexVault(
  sql: Sql,
  vaultRoot: string,
  now: string,
): Promise<{ indexed: number; removed: number }> {
  const nodes = await walkVault(vaultRoot, now);

  // Persist any generated ids back to disk (only permitted file mutation).
  // walkVault already parsed with id-ensure; detect generated ids by re-reading raw.
  const index = buildLinkIndex(nodes);

  for (const node of nodes) {
    const abs = join(vaultRoot, ...node.path.split(posix.sep), "index.md");
    const raw = await readFile(abs, "utf8");
    if (!raw.includes(`id: ${node.id}`)) {
      await writeIdBack(vaultRoot, node);
    }

    const ftsText = `${node.title}\n${node.body}`;
    await upsertPage(sql, {
      id: node.id,
      path: node.path,
      title: node.title,
      tags: node.frontmatter.tags,
      aliases: node.frontmatter.aliases,
      createdAt: node.frontmatter.created,
      updatedAt: node.frontmatter.updated,
      contentHash: contentHash(raw),
      ftsText,
    });

    const resolved = resolvePageLinks(node, extractWikiLinks(node.body), index);
    await replaceLinks(
      sql,
      node.id,
      resolved.map((r) => ({
        dstId: r.dstId,
        rawTarget: r.rawTarget,
        display: r.display,
        anchor: r.anchor,
      })),
    );
  }

  // Prune DB pages whose path no longer exists on disk.
  const livePaths = new Set(nodes.map((n) => n.path));
  const dbPages = await sql<{ id: string; path: string }[]>`SELECT id, path FROM pages`;
  let removed = 0;
  for (const p of dbPages) {
    if (!livePaths.has(p.path)) {
      await deletePageById(sql, p.id);
      removed++;
    }
  }

  return { indexed: nodes.length, removed };
}
```

`packages/indexer/src/index.ts`:
```ts
export * from "./contentHash.js";
export * from "./reindex.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/indexer/src/reindex.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/indexer
git commit -m "feat(indexer): full-vault re-index pipeline reconciling pages, fts, links"
```

---

### Task 14: File-watcher — incremental reconciliation of single pages

**Files:**
- Create: `packages/indexer/src/reindexPage.ts`
- Create: `packages/indexer/src/watcher.ts`
- Modify: `packages/indexer/src/index.ts`
- Test: `packages/indexer/src/watcher.test.ts`

**Interfaces:**
- Consumes: `pathToNode`, `buildLinkIndex`, `resolvePageLinks`, `extractWikiLinks`, `writeIdBack` (core); `walkVault` for the link index; DB repos; `contentHash` (Task 13).
- Produces:
  - `reindexPage(sql, vaultRoot, absDir, now): Promise<"indexed" | "skipped">` — reconcile one page folder (used on create/modify).
  - `removePageByPath(sql, relPath): Promise<void>` — used on delete.
  - `createWatcher(sql, vaultRoot, now, opts?): { close(): Promise<void>; ready: Promise<void> }` — chokidar watcher on `**/index.md`, debounced, dispatching add/change → `reindexPage`, unlink → `removePageByPath`. `now` may be a function `() => string` so callers inject time.

- [ ] **Step 1: Write the failing test**

`packages/indexer/src/watcher.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { withTestDb, getPageByPath } from "@opnnotes/db";
import { createWatcher } from "./watcher.js";

const NOW = () => "2026-07-29T12:00:00Z";

function waitFor<T>(fn: () => Promise<T | null>, ms = 10_000): Promise<T> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      const v = await fn();
      if (v) return resolve(v);
      if (Date.now() - start > ms) return reject(new Error("timeout"));
      setTimeout(tick, 100);
    };
    void tick();
  });
}

test("watcher indexes new pages and removes deleted ones", async () => {
  await withTestDb(async (sql) => {
    const root = await mkdtemp(join(tmpdir(), "opn-watch-"));
    const w = createWatcher(sql, root, NOW);
    await w.ready;

    await mkdir(join(root, "Note"), { recursive: true });
    await writeFile(join(root, "Note", "index.md"), `---\ntitle: Note\n---\nhi`);
    const row = await waitFor(() => getPageByPath(sql, "Note"));
    expect(row.title).toBe("Note");

    await rm(join(root, "Note"), { recursive: true, force: true });
    await waitFor(async () => ((await getPageByPath(sql, "Note")) === null ? true : null));

    await w.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/indexer/src/watcher.test.ts`
Expected: FAIL — `createWatcher` not defined.

- [ ] **Step 3: Write the implementation**

`packages/indexer/src/reindexPage.ts`:
```ts
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  buildLinkIndex,
  extractWikiLinks,
  pathToNode,
  resolvePageLinks,
  walkVault,
  writeIdBack,
} from "@opnnotes/core";
import { deletePageById, getPageByPath, replaceLinks, upsertPage, type Sql } from "@opnnotes/db";
import { contentHash } from "./contentHash.js";

export async function reindexPage(
  sql: Sql,
  vaultRoot: string,
  absDir: string,
  now: string,
): Promise<"indexed" | "skipped"> {
  const parsed = await pathToNode(vaultRoot, absDir, now);
  if (!parsed) return "skipped";
  const node = parsed.node;

  const raw = await readFile(join(absDir, "index.md"), "utf8");
  if (!raw.includes(`id: ${node.id}`)) await writeIdBack(vaultRoot, node);

  await upsertPage(sql, {
    id: node.id,
    path: node.path,
    title: node.title,
    tags: node.frontmatter.tags,
    aliases: node.frontmatter.aliases,
    createdAt: node.frontmatter.created,
    updatedAt: node.frontmatter.updated,
    contentHash: contentHash(raw),
    ftsText: `${node.title}\n${node.body}`,
  });

  // Build a link index across the whole vault so this page's links resolve.
  const index = buildLinkIndex(await walkVault(vaultRoot, now));
  const resolved = resolvePageLinks(node, extractWikiLinks(node.body), index);
  await replaceLinks(
    sql,
    node.id,
    resolved.map((r) => ({ dstId: r.dstId, rawTarget: r.rawTarget, display: r.display, anchor: r.anchor })),
  );
  return "indexed";
}

export async function removePageByPath(sql: Sql, relPath: string): Promise<void> {
  const posixPath = relPath.split(/[\\/]/).join(posix.sep);
  const row = await getPageByPath(sql, posixPath);
  if (row) await deletePageById(sql, row.id);
}
```

`packages/indexer/src/watcher.ts`:
```ts
import { dirname, relative, resolve } from "node:path";
import chokidar from "chokidar";
import type { Sql } from "@opnnotes/db";
import { reindexPage, removePageByPath } from "./reindexPage.js";

type NowArg = string | (() => string);
const nowStr = (n: NowArg): string => (typeof n === "function" ? n() : n);

export function createWatcher(
  sql: Sql,
  vaultRoot: string,
  now: NowArg,
  opts?: { debounceMs?: number },
): { close(): Promise<void>; ready: Promise<void> } {
  const debounceMs = opts?.debounceMs ?? 150;
  const timers = new Map<string, NodeJS.Timeout>();

  const watcher = chokidar.watch("**/index.md", {
    cwd: vaultRoot,
    ignored: /(^|[\\/])\../, // dot-dirs
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  const schedule = (relFile: string, fn: () => Promise<void>) => {
    const existing = timers.get(relFile);
    if (existing) clearTimeout(existing);
    timers.set(
      relFile,
      setTimeout(() => {
        timers.delete(relFile);
        void fn().catch((err) => console.error("[indexer]", relFile, err));
      }, debounceMs),
    );
  };

  watcher.on("add", (rel) => schedule(rel, () => reindexPage(sql, vaultRoot, resolve(vaultRoot, dirname(rel)), nowStr(now)).then(() => {})));
  watcher.on("change", (rel) => schedule(rel, () => reindexPage(sql, vaultRoot, resolve(vaultRoot, dirname(rel)), nowStr(now)).then(() => {})));
  watcher.on("unlink", (rel) => schedule(rel, () => removePageByPath(sql, relative(".", dirname(rel)))));

  const ready = new Promise<void>((res) => watcher.on("ready", () => res()));

  return {
    ready,
    async close() {
      for (const t of timers.values()) clearTimeout(t);
      await watcher.close();
    },
  };
}
```

Add to `packages/indexer/src/index.ts`:
```ts
export * from "./reindexPage.js";
export * from "./watcher.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/indexer/src/watcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/reindexPage.ts packages/indexer/src/watcher.ts packages/indexer/src/watcher.test.ts packages/indexer/src/index.ts
git commit -m "feat(indexer): chokidar file-watcher with debounced per-page reconcile"
```

---

### Task 15: Keyword search query (page-level) + full-vault rebuild command

**Files:**
- Create: `packages/db/src/searchRepo.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/indexer/src/rebuild.ts` (thin CLI-callable wrapper)
- Modify: `packages/indexer/src/index.ts`
- Test: `packages/db/src/searchRepo.test.ts`

**Interfaces:**
- Consumes: `Sql` (Task 10), `upsertPage` (Task 11), `reindexVault` (Task 13).
- Produces:
  - `SearchHit` — `{ id: string; path: string; title: string; rank: number }`
  - `keywordSearch(sql, query: string, limit?: number): Promise<SearchHit[]>` — `plainto_tsquery('english', query)` against `page_fts`, ranked by `ts_rank`, joined to `pages`.
  - `rebuild(databaseUrl: string, vaultRoot: string, now: string): Promise<{ indexed: number; removed: number }>` — connects, migrates, runs `reindexVault`, disconnects. (Entry point a future CLI/admin `reindex` route calls.)

- [ ] **Step 1: Write the failing test**

`packages/db/src/searchRepo.test.ts`:
```ts
import { expect, test } from "vitest";
import { withTestDb } from "./testHelper.js";
import { upsertPage } from "./pagesRepo.js";
import { keywordSearch } from "./searchRepo.js";

test("keywordSearch ranks matching pages", async () => {
  await withTestDb(async (sql) => {
    await upsertPage(sql, {
      id: "01J8ZC7Q9V3K7M2F0X4RAAAAAA", path: "A", title: "Markdown Guide",
      tags: [], aliases: [], createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z", contentHash: "h",
      ftsText: "markdown markdown notes",
    });
    await upsertPage(sql, {
      id: "01J8ZC7Q9V3K7M2F0X4RBBBBBB", path: "B", title: "Other",
      tags: [], aliases: [], createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z", contentHash: "h",
      ftsText: "unrelated content",
    });
    const hits = await keywordSearch(sql, "markdown");
    expect(hits.map((h) => h.path)).toEqual(["A"]);
    expect(hits[0]!.rank).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/db/src/searchRepo.test.ts`
Expected: FAIL — `keywordSearch` not defined.

- [ ] **Step 3: Write the implementation**

`packages/db/src/searchRepo.ts`:
```ts
import type { Sql } from "./client.js";

export interface SearchHit {
  id: string;
  path: string;
  title: string;
  rank: number;
}

export async function keywordSearch(
  sql: Sql,
  query: string,
  limit = 20,
): Promise<SearchHit[]> {
  return sql<SearchHit[]>`
    SELECT p.id, p.path, p.title,
           ts_rank(f.tsv, plainto_tsquery('english', ${query})) AS rank
    FROM page_fts f
    JOIN pages p ON p.id = f.page_id
    WHERE f.tsv @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}`;
}
```

Add to `packages/db/src/index.ts`:
```ts
export * from "./searchRepo.js";
```

`packages/indexer/src/rebuild.ts`:
```ts
import { createClient, migrate } from "@opnnotes/db";
import { reindexVault } from "./reindex.js";

export async function rebuild(
  databaseUrl: string,
  vaultRoot: string,
  now: string,
): Promise<{ indexed: number; removed: number }> {
  const sql = createClient(databaseUrl);
  try {
    await migrate(sql);
    return await reindexVault(sql, vaultRoot, now);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
```

Add to `packages/indexer/src/index.ts`:
```ts
export * from "./rebuild.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/db/src/searchRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all package test suites PASS (Docker required).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/searchRepo.ts packages/db/src/searchRepo.test.ts packages/db/src/index.ts packages/indexer/src/rebuild.ts packages/indexer/src/index.ts
git commit -m "feat: keyword search query and full-vault rebuild entry point"
```

---

## Self-Review

**1. Spec coverage (this plan's scope = roadmap phases 1–2):**
- Folder-per-page + `index.md` → Task 8 (`walkVault`, `pathToNode`). ✓
- Frontmatter schema, ULID `id`, id-ensure, foreign-key preservation → Tasks 2, 3, 8. ✓
- Hierarchy from folder nesting (no `parent` field) → Task 8 (`parentPath`). ✓
- Wiki-links by title, ignoring code → Task 5; resolution + nearest-in-tree → Task 9. ✓
- Tags from frontmatter + inline `#hashtags`, merged → Task 6, 7. ✓
- Postgres cache tables (`pages`, `page_fts`, `links`) + pgvector extension present → Task 10. ✓
- Full-text (keyword) search → Tasks 11, 15. ✓
- File-watcher + re-index pipeline reconciling all write paths (incl. external FS edits) → Tasks 13, 14. ✓
- Full rebuild ("rebuildable from files") → Tasks 13, 15. ✓
- Backlinks (graph groundwork) → Task 12. ✓
- **Deferred beyond this plan (correctly out of scope):** embeddings/`page_chunks`, semantic search, graph edges table, ACL/share/persist tables, REST API, git commit-on-save, remote sync, MCP. These belong to later plans per roadmap.md.

**2. Placeholder scan:** No `TODO`/"add error handling"/"similar to Task N" placeholders. Watcher errors are logged explicitly; every code step has real code.

**3. Type consistency:** `Frontmatter`, `PageNode`, `ParsedPage`, `WikiLink`, `ResolvedLink` defined in Task 1 and used unchanged. `upsertPage`'s `UpsertPageInput` shape (Task 11) is exactly what Tasks 13/14 construct. `keywordSearch`→`SearchHit`, `getPageByPath`→`PageRow` names align across tasks. `now` is injected everywhere (no `Date.now()` in `core`), consistent from Task 3 onward.

---

## Notes for the executor

- **Docker is required** for the `@opnnotes/db` and `@opnnotes/indexer` tests (Testcontainers). If Docker is unavailable, those suites will fail to start containers — run `core` tests independently with `pnpm vitest run packages/core`.
- `content_hash` is stored now but not yet used to skip unchanged pages; a later optimization task can add "skip if hash unchanged" to `reindexPage`/`reindexVault`.
- The link index is rebuilt per page in `reindexPage` (Task 14) for correctness; a later performance task can cache and incrementally update it.
