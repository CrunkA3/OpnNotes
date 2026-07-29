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
