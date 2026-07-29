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
