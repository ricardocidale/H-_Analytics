import stableStringify from "json-stable-stringify";
import { createHash } from "crypto";
import deepEqual from "fast-deep-equal";

export function stableHash(payload: unknown): string {
  const canonical = stableStringify(payload) ?? "";
  return createHash("sha256").update(canonical).digest("hex");
}

export function stableEquals(a: unknown, b: unknown): boolean {
  return deepEqual(a, b);
}

export { stableStringify, deepEqual };
