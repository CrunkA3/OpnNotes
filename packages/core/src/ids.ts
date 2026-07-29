import { ulid } from "ulid";

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function newId(): string {
  return ulid();
}

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && ULID_REGEX.test(value);
}
