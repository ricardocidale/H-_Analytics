/**
 * Phase 3 (Constants doctrine): server-side guard on the manual override path.
 *
 * Locks gap G3 from `docs/audits/constants-specialist-ownership-gap.md`:
 * authority-sourced Constants are owned by AI Intelligence Specialists and
 * cannot be hand-edited via PUT /api/admin/model-constants/:key. The guard
 * keys off `MODEL_CONSTANTS_REGISTRY[key].specialistOwned` so flipping that
 * flag is the only way to (re)open the manual path for a given key.
 *
 * This test combines:
 *   1. Registry contract — every key in MODEL_CONSTANTS_REGISTRY today is
 *      specialistOwned (mirror of the catalog ownership in
 *      `engine/analyst/registry/specialist-catalog.ts`).
 *   2. Static lock on the PUT handler — the guard is present, returns 422,
 *      uses the SPECIALIST_OWNED_CONSTANT code, fires before parsing body /
 *      calling storage, and the analyst-apply / DELETE paths are NOT
 *      similarly guarded (admins keep the rollback escape hatch and the
 *      analyst writer keeps writing).
 *   3. Logger import — the deprecation telemetry hook is wired in.
 *
 * The static-analysis approach mirrors the project convention (see
 * `tests/server/property-photos-routes.test.ts` and
 * `tests/server/global-assumptions-denylist.test.ts`).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { MODEL_CONSTANTS_REGISTRY } from "../../shared/model-constants-registry";

const routeSrc = readFileSync(
  resolve(__dirname, "../../server/routes/admin/model-constants.ts"),
  "utf8",
);

describe("Phase 3 — registry contract", () => {
  it("every registered constant is specialistOwned today", () => {
    const notOwned: string[] = [];
    for (const [key, entry] of Object.entries(MODEL_CONSTANTS_REGISTRY)) {
      if (entry.specialistOwned !== true) notOwned.push(key);
    }
    expect(
      notOwned,
      `Every Constant in MODEL_CONSTANTS_REGISTRY must be specialistOwned. ` +
        `If you intend to allow manual overrides for a key, justify it in the ` +
        `audit doc and update this test. Offending: ${notOwned.join(", ")}`,
    ).toHaveLength(0);
  });

  it("specialistOwned is a boolean, not undefined or coerced", () => {
    for (const [key, entry] of Object.entries(MODEL_CONSTANTS_REGISTRY)) {
      expect(typeof entry.specialistOwned, `key ${key}`).toBe("boolean");
    }
  });
});

describe("Phase 3 — PUT /api/admin/model-constants/:key guard (static)", () => {
  it("imports the logger for deprecation telemetry", () => {
    expect(routeSrc).toMatch(/from\s+["']\.\.\/\.\.\/logger["']/);
  });

  it("registers the PUT route", () => {
    expect(routeSrc).toMatch(/app\.put\(\s*["']\/api\/admin\/model-constants\/:key["']/);
  });

  it("checks entry.specialistOwned and returns 422 with SPECIALIST_OWNED_CONSTANT code", () => {
    expect(routeSrc).toMatch(/if\s*\(\s*entry\.specialistOwned\s*\)/);
    expect(routeSrc).toMatch(/res\.status\(\s*422\s*\)/);
    expect(routeSrc).toMatch(/SPECIALIST_OWNED_CONSTANT/);
  });

  it("guard fires before body parsing and storage write (order check)", () => {
    const guardIdx = routeSrc.indexOf("SPECIALIST_OWNED_CONSTANT");
    const parseIdx = routeSrc.indexOf("overrideBodySchema.safeParse");
    const writeIdx = routeSrc.indexOf("upsertModelConstantOverride");
    expect(guardIdx).toBeGreaterThan(0);
    expect(parseIdx).toBeGreaterThan(guardIdx);
    expect(writeIdx).toBeGreaterThan(guardIdx);
  });

  it("error message points the caller at the Refresh research / analyst-apply path", () => {
    // The 422 body must explain WHY (authority-sourced) and WHERE TO GO
    // INSTEAD (Refresh research → apply-research). Saves the admin a
    // round-trip to the docs.
    const guardBlock = routeSrc.slice(
      routeSrc.indexOf("entry.specialistOwned"),
      routeSrc.indexOf("overrideBodySchema.safeParse"),
    );
    expect(guardBlock).toMatch(/authority-sourced/);
    expect(guardBlock).toMatch(/Refresh research/);
    expect(guardBlock).toMatch(/apply-research/);
  });

  it("emits a logger.warn deprecation entry for non-specialist-owned keys", () => {
    expect(routeSrc).toMatch(/logger\.warn\(/);
    expect(routeSrc).toMatch(/deprecated/);
  });
});

describe("Phase 3 — escape hatches remain open", () => {
  it("DELETE /api/admin/model-constants/:key (reset-to-factory) is NOT guarded", () => {
    // Admins always retain the rollback path. Locate the DELETE handler
    // and assert the SPECIALIST_OWNED_CONSTANT guard is absent within it.
    const deleteIdx = routeSrc.search(
      /app\.delete\(\s*["']\/api\/admin\/model-constants\/:key["']/,
    );
    expect(deleteIdx).toBeGreaterThan(-1);
    // Slice to the next route registration to bound the handler body.
    const after = routeSrc.slice(deleteIdx);
    const nextRouteIdx = after.search(/app\.(get|post|put|delete|patch)\(/g);
    // First match is the delete itself; find the SECOND.
    const tail = after.slice(nextRouteIdx + 1);
    const handlerEnd = tail.search(/app\.(get|post|put|delete|patch)\(/g);
    const handlerBody = handlerEnd === -1 ? after : after.slice(0, nextRouteIdx + 1 + handlerEnd);
    expect(handlerBody).not.toMatch(/SPECIALIST_OWNED_CONSTANT/);
  });

  it("POST /api/admin/model-constants/:key/apply-research (analyst writer) is NOT guarded", () => {
    const applyIdx = routeSrc.search(
      /app\.post\(\s*["']\/api\/admin\/model-constants\/:key\/apply-research["']/,
    );
    expect(applyIdx).toBeGreaterThan(-1);
    const after = routeSrc.slice(applyIdx);
    const tail = after.slice(1);
    const handlerEnd = tail.search(/app\.(get|post|put|delete|patch)\(/g);
    const handlerBody = handlerEnd === -1 ? after : after.slice(0, 1 + handlerEnd);
    expect(handlerBody).not.toMatch(/SPECIALIST_OWNED_CONSTANT/);
    // And it still writes via storage with source = "analyst".
    expect(handlerBody).toMatch(/source:\s*["']analyst["']/);
  });

  it("POST /regenerate (proposal preview) is NOT guarded", () => {
    const regenIdx = routeSrc.search(
      /app\.post\(\s*["']\/api\/admin\/model-constants\/:key\/regenerate["']/,
    );
    expect(regenIdx).toBeGreaterThan(-1);
    const after = routeSrc.slice(regenIdx);
    const tail = after.slice(1);
    const handlerEnd = tail.search(/app\.(get|post|put|delete|patch)\(/g);
    const handlerBody = handlerEnd === -1 ? after : after.slice(0, 1 + handlerEnd);
    expect(handlerBody).not.toMatch(/SPECIALIST_OWNED_CONSTANT/);
  });
});
