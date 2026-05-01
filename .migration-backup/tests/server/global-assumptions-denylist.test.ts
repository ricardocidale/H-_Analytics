import { describe, it, expect } from "vitest";
import {
  GLOBAL_ASSUMPTIONS_CANONICAL_DENYLIST,
  stripCanonicalDenylistedFields,
} from "../../server/routes/global-assumptions-denylist";

/**
 * Task #379: ensure both globalAssumptions write paths
 * (PUT /api/global-assumptions and POST /api/global-assumptions/save-tab)
 * cannot mutate fields whose canonical home is the Model Constants tab.
 *
 * The handlers thread their inbound payload through
 * `stripCanonicalDenylistedFields` before merge with the existing row,
 * so this test focuses on the helper's contract — if either handler is
 * refactored to bypass the helper, the integration-style test under
 * tests/server/global-assumptions-routes-denylist.test.ts will catch it.
 */
describe("globalAssumptions canonical-field denylist", () => {
  it("includes depreciationYears (Task #379 canonical key)", () => {
    expect(GLOBAL_ASSUMPTIONS_CANONICAL_DENYLIST.has("depreciationYears")).toBe(true);
  });

  it("strips denylisted keys from a partial-globalAssumptions payload", () => {
    const input = {
      depreciationYears: 27.5,
      inflationRate: 0.03,
      companyName: "Test Co",
    };
    const out = stripCanonicalDenylistedFields(input);
    expect(out).toEqual({ inflationRate: 0.03, companyName: "Test Co" });
    // Non-mutation: input is untouched.
    expect(input.depreciationYears).toBe(27.5);
  });

  it("returns an equivalent payload when no denylisted keys are present", () => {
    const input = { inflationRate: 0.03, companyName: "Test Co" };
    const out = stripCanonicalDenylistedFields(input);
    expect(out).toEqual(input);
  });

  it("handles empty payloads", () => {
    expect(stripCanonicalDenylistedFields({})).toEqual({});
  });
});

/**
 * Static contract test: confirm both globalAssumptions handlers route
 * their inbound payload through `stripCanonicalDenylistedFields`. This
 * is intentionally a string-level lock — a refactor that moves the
 * sanitizer to a shared middleware should update this test alongside.
 */
describe("globalAssumptions handlers consume the denylist", () => {
  // Lazy import to keep the test cheap; we only need the file source.
  const { readFileSync } = require("fs") as typeof import("fs");
  const { resolve } = require("path") as typeof import("path");
  const handlersSrc = readFileSync(
    resolve(__dirname, "..", "..", "server/routes/global-assumptions.ts"),
    "utf8",
  );

  it("PUT /api/global-assumptions sanitizes inbound body", () => {
    expect(handlersSrc).toMatch(/app\.put\(\s*["']\/api\/global-assumptions["']/);
    expect(handlersSrc).toMatch(/stripCanonicalDenylistedFields\(\s*bodyValidation\.data/);
  });

  it("POST /api/global-assumptions/save-tab sanitizes inbound patch", () => {
    expect(handlersSrc).toMatch(
      /app\.post\(\s*["']\/api\/global-assumptions\/save-tab["']/,
    );
    // Sanitize the `patch` payload then merge the result with `baseRow`.
    expect(handlersSrc).toMatch(/stripCanonicalDenylistedFields\([\s\S]*?patch\s*\?\?\s*\{\}/);
    const sanitizeIdx = handlersSrc.search(
      /const\s+sanitizedPatch\s*=\s*stripCanonicalDenylistedFields/,
    );
    const mergeIdx = handlersSrc.indexOf("...sanitizedPatch");
    expect(sanitizeIdx).toBeGreaterThan(-1);
    expect(mergeIdx).toBeGreaterThan(sanitizeIdx);
  });
});
