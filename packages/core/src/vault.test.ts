import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
  await writeFile(join(root, "Projects", "OpnNotes", "index.md"), `---\ntitle: OpnNotes\n---\nchild body`);
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
