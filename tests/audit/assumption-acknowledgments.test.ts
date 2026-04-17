import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Assumption Acknowledgments — post-review hardening tests.
 *
 * These pin the security/correctness fixes the architect flagged on the
 * "Keep my value" override flow:
 *
 *   1. Per-user scoping  — every storage query MUST include userId so two
 *      users on the same company-level field never collide on entityId=0.
 *   2. Unique constraint — the DB unique key MUST include user_id so the
 *      onConflictDoUpdate target matches per-user upsert semantics.
 *   3. Route hand-off    — list + delete handlers MUST forward the
 *      authenticated userId into the storage layer (no anonymous reads
 *      or cross-user deletes).
 *   4. handleKeep        — MUST check response.ok and invalidate the ack
 *      query cache so a failed write surfaces a toast instead of silently
 *      dismissing the warning.
 *   5. handleSaveTab     — MUST recompute warnings across the FULL tab
 *      field set, not just `touched`, so a previously-flagged value that
 *      was not edited this round still surfaces.
 *   6. RangePillsLayer   — MUST scope its MutationObserver via rootRef
 *      to avoid rerendering on every body-level DOM change.
 *   7. Lint guard        — strip-pattern check MUST be wired into a CI
 *      workflow (audit:quick) so reintroducing Analyst/Save into the
 *      PageHeader breaks the build.
 *
 * Tests are static-analysis (read source) to keep them fast and free of
 * a live DB; functional behavior of the underlying queries is exercised
 * by the existing storage layer integration tests.
 */

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf-8");

describe("Acknowledgments — schema (per-user uniqueness)", () => {
  const src = read("shared/schema/intelligence-v2.ts");

  it("unique constraint includes user_id (no cross-user collisions)", () => {
    expect(src).toMatch(
      /unique\("assumption_ack_entity_field_uq"\)\.on\([^)]*table\.userId[^)]*\)/,
    );
  });

  it("entity-lookup index includes user_id for per-user list query plans", () => {
    expect(src).toMatch(
      /index\("assumption_ack_entity_idx"\)\.on\([^)]*table\.userId[^)]*\)/,
    );
  });

  it("insert schema picks userId so the route can stamp the authenticated user", () => {
    expect(src).toMatch(/insertAssumptionAcknowledgmentSchema[\s\S]{0,400}userId:\s*true/);
  });
});

describe("Acknowledgments — storage (userId in every query)", () => {
  const src = read("server/storage/intelligence-v2.ts");

  it("getAcknowledgment requires userId param and filters on it", () => {
    expect(src).toMatch(/getAcknowledgment\([\s\S]*?userId:\s*number/);
    const slice = src.split("getAcknowledgment(")[1].split("listAcknowledgments")[0];
    expect(slice).toContain("eq(assumptionAcknowledgments.userId, userId)");
  });

  it("listAcknowledgments requires userId param and filters on it", () => {
    expect(src).toMatch(/listAcknowledgments\([\s\S]*?userId:\s*number/);
    const slice = src.split("listAcknowledgments(")[1].split("upsertAcknowledgment")[0];
    expect(slice).toContain("eq(assumptionAcknowledgments.userId, userId)");
  });

  it("deleteAcknowledgment requires userId param and filters on it", () => {
    expect(src).toMatch(/deleteAcknowledgment\([\s\S]*?userId:\s*number/);
    const slice = src.split("deleteAcknowledgment(")[1];
    expect(slice).toContain("eq(assumptionAcknowledgments.userId, userId)");
  });

  it("upsertAcknowledgment onConflictDoUpdate target includes userId column", () => {
    const slice = src.split("upsertAcknowledgment(")[1].split("deleteAcknowledgment")[0];
    expect(slice).toMatch(/target:\s*\[[\s\S]*assumptionAcknowledgments\.userId[\s\S]*\]/);
  });
});

describe("Acknowledgments — routes (forward authenticated userId)", () => {
  const src = read("server/routes/global-assumptions.ts");

  it("GET /api/assumption-acknowledgments forwards getAuthUser(req).id to listAcknowledgments", () => {
    expect(src).toMatch(
      /listAcknowledgments\(\s*entityType\s*,\s*entityId\s*,\s*getAuthUser\(req\)\.id\s*\)/,
    );
  });

  it("DELETE /api/assumption-acknowledgments/:fieldName forwards getAuthUser(req).id", () => {
    expect(src).toMatch(
      /deleteAcknowledgment\([\s\S]{0,200}getAuthUser\(req\)\.id\s*\)/,
    );
  });

  it("POST handler stamps userId from getAuthUser(req).id (never trusts body)", () => {
    expect(src).toMatch(
      /upsertAcknowledgment\(\{[\s\S]{0,200}userId:\s*getAuthUser\(req\)\.id/,
    );
  });
});

describe("TabActions.handleKeep — fail loudly + invalidate cache", () => {
  const src = read("client/src/components/company-assumptions/TabActions.tsx");

  it("imports useQueryClient (so cache can be invalidated post-write)", () => {
    expect(src).toContain("useQueryClient");
  });

  it("checks response.ok on BOTH the change-log and ack POSTs before declaring success", () => {
    // The handler should branch on logRes.ok AND ackRes.ok — silently
    // toasting "Value kept" when the ack POST returned 4xx/5xx would
    // desync the UI from the database.
    expect(src).toMatch(/!logRes\.ok\s*\|\|\s*!ackRes\.ok/);
  });

  it("invalidates the assumption-acknowledgments query after a successful write", () => {
    expect(src).toMatch(
      /invalidateQueries\(\s*\{\s*queryKey:\s*\[\s*"assumption-acknowledgments"\s*,\s*"company"\s*,\s*0\s*\]/,
    );
  });

  it("never dismisses the warning on a failed write", () => {
    // onDismissWarning(w.fieldName) should sit AFTER the response.ok guard,
    // not in the catch path or before the throw.
    const handlerStart = src.indexOf("const handleKeep");
    const handlerEnd = src.indexOf("const handleAdjust", handlerStart);
    const handler = src.slice(handlerStart, handlerEnd);
    const throwIdx = handler.indexOf("throw new Error");
    const dismissIdx = handler.indexOf("onDismissWarning(");
    expect(throwIdx).toBeGreaterThan(0);
    expect(dismissIdx).toBeGreaterThan(throwIdx);
  });
});

describe("CompanyAssumptions — ack lifecycle on edit + save", () => {
  const src = read("client/src/pages/CompanyAssumptions.tsx");

  it("uses useQueryClient (needed to invalidate ack cache on field edit)", () => {
    expect(src).toContain("useQueryClient");
  });

  it("invalidates ack cache when DELETE on edit succeeds", () => {
    // The .then(res => res.ok && invalidate) branch must exist on the
    // ack-clear path — without it the client keeps suppressing the
    // warning for a field the user just changed. Locate the ackByField
    // edit-handler block, then assert it issues a DELETE and an
    // invalidateQueries against the ack cache key.
    const blockStart = src.indexOf("ackByField.has(String(field))");
    expect(blockStart).toBeGreaterThan(0);
    const block = src.slice(blockStart, blockStart + 800);
    expect(block).toContain('method: "DELETE"');
    expect(block).toContain("res.ok");
    expect(block).toContain("invalidateQueries");
    expect(block).toContain('"assumption-acknowledgments"');
  });

  it("handleSaveTab recomputes warnings across the FULL tab field set, not just touched", () => {
    // The architect flagged that computeTabWarnings(touched, ...) reports
    // a tab as clean while a previously-flagged untouched field remains.
    // The fix: pass `keys` (the full TAB_FIELDS[tab]) instead of `touched`.
    expect(src).toMatch(/computeTabWarnings\(\s*keys\s*,\s*formData\s*\)/);
    expect(src).not.toMatch(/computeTabWarnings\(\s*touched\s*,\s*formData\s*\)/);
  });
});

describe("RangePillsLayer — re-evaluates on tab change without a global observer", () => {
  const src = read("client/src/components/company-assumptions/RangePillsLayer.tsx");

  it("does NOT use a body-wide MutationObserver (perf footgun)", () => {
    // Earlier revisions watched `document.body` which thrashed on every
    // unrelated DOM mutation. The replacement strategy uses a `reKey` prop
    // bumped by callers on tab change instead. We match the constructor
    // call (`new MutationObserver(`) rather than any mention of the word so
    // explanatory comments don't trip the guard.
    expect(src).not.toMatch(/\bnew\s+(?:window\.)?MutationObserver\s*\(/);
    expect(src).not.toMatch(/document\.body/);
  });

  it("accepts a reKey prop that triggers re-evaluation when it changes", () => {
    expect(src).toMatch(/reKey\?:\s*string/);
    expect(src).toMatch(/\[reKey,\s*pills\]/);
  });

  it("uses requestAnimationFrame to catch async-mounted inputs after tab switch", () => {
    expect(src).toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/cancelAnimationFrame/);
  });
});

describe("CompanyAssumptions — passes the active tab as the RangePillsLayer reKey", () => {
  const src = read("client/src/pages/CompanyAssumptions.tsx");

  it("passes activeTab as reKey to RangePillsLayer", () => {
    expect(src).toContain("<RangePillsLayer pills={pills} reKey={activeTab} />");
  });

  it("does not introduce a tabPanelRef ref-passing pattern (caused hooks-order bug)", () => {
    // The previous attempt added `useRef` + a conditional ref on TabsContent
    // which interacted poorly with Radix/HMR. The reKey approach is safer
    // and requires no extra hook in the page.
    expect(src).not.toMatch(/tabPanelRef/);
  });
});

describe("Strip-pattern lint guard — wired into audit:quick", () => {
  const src = read("script/audit-quick.ts");

  it("audit:quick invokes script/check-no-header-analyst-save.ts", () => {
    expect(src).toContain("script/check-no-header-analyst-save.ts");
  });

  it("audit:quick treats a guard failure as a critical finding", () => {
    // critical findings increment `issues` and exit non-zero, which is
    // what makes this an effective CI gate.
    expect(src).toMatch(
      /Strip-pattern guard[\s\S]{0,400}severity:\s*stripGuardCount\s*>\s*0\s*\?\s*"critical"/,
    );
  });

  it("the guard script itself exists and is executable as a tsx entrypoint", () => {
    const guard = read("script/check-no-header-analyst-save.ts");
    expect(guard).toContain("AnalystButton");
    expect(guard).toContain("SaveButton");
    expect(guard).toMatch(/process\.exit\(/);
  });
});
