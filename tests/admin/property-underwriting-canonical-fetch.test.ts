import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Contract test for the read-only depreciationYears display in
 * PropertyUnderwritingTab.
 *
 * The display fetches `/api/admin/model-constants?country=...` and reads
 * the resolved canonical value out of the response. The server route
 * (server/routes/admin/model-constants.ts) returns
 *   { country, subdivision, items: [{ key, effectiveValue, ... }] }
 *
 * A previous iteration of this component parsed the response as
 * `{ rows: [...] }`, which silently degraded to "—" forever. This test
 * locks the parser in place so that regression cannot recur:
 *   1. Server route still returns `items` + `effectiveValue`.
 *   2. Client component still parses `items` + `effectiveValue`.
 *
 * If you change either side, update the other and update this test.
 */
describe("PropertyUnderwritingTab canonical depreciationYears fetch — contract", () => {
  const repoRoot = resolve(__dirname, "..", "..");
  const serverRoutePath = resolve(repoRoot, "server/routes/admin/model-constants.ts");
  const clientComponentPath = resolve(
    repoRoot,
    "client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx",
  );

  it("server GET /api/admin/model-constants still returns an `items` array with `effectiveValue`", () => {
    const src = readFileSync(serverRoutePath, "utf8");
    expect(src).toMatch(/app\.get\(\s*["']\/api\/admin\/model-constants["']/);
    expect(src).toMatch(/items:\s*REGISTERED_CONSTANT_KEYS\.map|items,/);
    expect(src).toMatch(/effectiveValue:\s*resolved\.value/);
  });

  it("client component parses `items` (not `rows`) and reads `effectiveValue` for the depreciationYears row", () => {
    const src = readFileSync(clientComponentPath, "utf8");
    // Negative assertion — the previous broken contract must not creep back.
    expect(src).not.toMatch(/json\.rows/);
    // Positive assertions — the new contract is in place.
    expect(src).toMatch(/json\.items\?\.find\(\(r\)\s*=>\s*r\.key\s*===\s*["']depreciationYears["']\)/);
    expect(src).toMatch(/effectiveValue/);
    // The fetch must hit the canonical admin endpoint with the United
    // States baseline locality.
    expect(src).toMatch(/\/api\/admin\/model-constants\?country=/);
    expect(src).toMatch(/United States/);
    // Final display reads the resolved numeric value, not the draft.
    expect(src).toMatch(/depYearsDisplay/);
    expect(src).not.toMatch(/draft\.depreciationYears \?\? 39/);
  });
});
