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
