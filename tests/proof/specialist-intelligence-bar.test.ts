/**
 * specialist-intelligence-bar.test.ts
 *
 * Static enforcement of the Intelligence Bar requirements for every built
 * assumption-tab Specialist (`.claude/rules/specialist-intelligence-bar.md`).
 *
 * "Assumption-tab Specialist" = status "built" AND NOT in the
 * VERDICT_DIMENSION_EXEMPT set (narrative reports, image gen, toolbox
 * maintainers, and Tier-0-only monitors are exempt).
 *
 * What this test does NOT check (reasons noted inline):
 *   R1: cognitiveRunId non-null — requires a live LLM fixture run; covered
 *       by per-specialist IB bench tests (e.g. funding-g6p3b.test.ts).
 *   R2: context-rich prompt — prose review at PR time; not statically assertable.
 *   R3: ≥3 citation-backed evidence items per dim — requires live run; IB bench.
 *   R4: tabular comparables on numeric dims — PR review; not statically assertable.
 *   R6: range + conviction ≥ floor on non-ok dims — covered by verdict-shape.test.ts.
 *   R7: ≥2 vendor breadth in cognitive run — requires live run; IB bench.
 *   R8: PE pre-stage (promptEngineerRunId) — live run; IB bench.
 *
 * What this test DOES check (statically, zero LLM calls):
 *   R5 — catalog declares ≥1 { kind: "api" } assignmentRef
 *   R9 — synthesis-validator file exists on disk
 *   R9+ — validator enforces TIER_1_MIN_TOTAL_EVIDENCE (post-sweep invariant,
 *          added 2026-04-30, commit 22dd9e91 + this commit)
 *   ——  — completeness gate: every new built specialist is either in the
 *          exempt set (with justification) or covered by R5 + R9 checks here.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";

// ── Exempt set — built Specialists that do NOT emit per-field assumption
//    verdicts and are therefore exempt from IB requirements R1–R9.
//    Must match `BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS` in
//    tests/analyst/voice/field-registry-parity.test.ts (kept in sync manually).
// ──────────────────────────────────────────────────────────────────────────────
const VERDICT_DIMENSION_EXEMPT: ReadonlySet<string> = new Set([
  // Letícia (L) — Resource Builder. Work product is SPECIALIST_TOOLS, not verdicts.
  "resources.builder",
  // Eloá (E) — Executive Summary. Narrative report, not per-field assumption verdicts.
  "property.executive-summary",
  // Cecília (C) — ICP Intelligence. Portfolio narrative, not per-field verdicts.
  "mgmt-co.icp-intelligence",
  // Giovanna (G) — Portfolio Watchdog. Tier-0 deterministic, no LLM, no AnalystVerdict.
  "portfolio-ops.watchdog",
  // Fernanda (F) — Photo Enhancer. Image-gen pipeline, no assumption verdicts.
  "photos.photo-enhancer",
]);

// ── Validator file map — keyed by specialist id, value is the relative path
//    from the repo root to the synthesis-validator file.  Maintained here
//    because the naming convention is not perfectly derivable from the id
//    (e.g. property.risk-intelligence → property-risk-synthesis-validator.ts
//    drops "intelligence"). Add a new entry whenever a new assumption-tab
//    Specialist ships.
// ──────────────────────────────────────────────────────────────────────────────
const VALIDATOR_FILES: Record<string, string> = {
  "mgmt-co.funding":
    "server/ai/specialists/mgmt-co-funding-synthesis-validator.ts",
  "mgmt-co.revenue":
    "server/ai/specialists/mgmt-co-revenue-synthesis-validator.ts",
  "mgmt-co.compensation":
    "server/ai/specialists/mgmt-co-compensation-synthesis-validator.ts",
  "mgmt-co.overhead":
    "server/ai/specialists/mgmt-co-overhead-synthesis-validator.ts",
  "mgmt-co.company":
    "server/ai/specialists/mgmt-co-company-synthesis-validator.ts",
  "mgmt-co.property-defaults":
    "server/ai/specialists/mgmt-co-property-defaults-synthesis-validator.ts",
  "property.risk-intelligence":
    "server/ai/specialists/property-risk-synthesis-validator.ts",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function resolveFromRoot(relPath: string): string {
  return path.resolve(process.cwd(), relPath);
}

function readFileOrNull(relPath: string): string | null {
  const abs = resolveFromRoot(relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
}

// Built assumption-tab specialists = built AND not in the exempt set.
const assumptionTabSpecialists = SPECIALIST_CATALOG.filter(
  (d) => d.status === "built" && !VERDICT_DIMENSION_EXEMPT.has(d.id),
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Intelligence Bar — assumption-tab Specialists", () => {
  it("finds at least one assumption-tab Specialist to test", () => {
    expect(assumptionTabSpecialists.length).toBeGreaterThan(0);
  });

  it("every built assumption-tab Specialist is covered by this test (completeness gate)", () => {
    // Any specialist that slips through — built, not exempt, but missing from
    // VALIDATOR_FILES — would escape all static checks silently. This assertion
    // surfaces the gap immediately.
    const uncovered = assumptionTabSpecialists
      .map((d) => d.id)
      .filter((id) => !(id in VALIDATOR_FILES));

    expect(uncovered).toEqual(
      [],
      `These built assumption-tab Specialists have no entry in VALIDATOR_FILES:\n` +
        `  ${uncovered.join(", ")}\n` +
        `Add the validator file path to VALIDATOR_FILES in this test.`,
    );
  });

  // R5 — catalog declares ≥1 { kind: "api" } assignmentRef
  describe("R5 — at least one api assignmentRef per Specialist", () => {
    for (const def of assumptionTabSpecialists) {
      it(`${def.letter} ${def.humanName} (${def.id})`, () => {
        const hasApi = (def.assignmentRefs ?? []).some((r) => r.kind === "api");
        expect(hasApi).toBe(
          true,
          `Specialist "${def.id}" (${def.humanName}) has no { kind: "api" } entry in ` +
            `assignmentRefs. IB requirement R5 requires at least one live API resource ` +
            `assignment. Add an entry to the catalog's assignmentRefs array.`,
        );
      });
    }
  });

  // R9 — synthesis-validator file exists on disk
  describe("R9 — synthesis-validator file exists", () => {
    for (const def of assumptionTabSpecialists) {
      it(`${def.letter} ${def.humanName} (${def.id})`, () => {
        const relPath = VALIDATOR_FILES[def.id];
        expect(relPath).toBeDefined(
          `No VALIDATOR_FILES entry for "${def.id}". Add it to the map in this test.`,
        );
        const abs = resolveFromRoot(relPath!);
        expect(fs.existsSync(abs)).toBe(
          true,
          `Synthesis-validator file not found: ${relPath}\n` +
            `IB requirement R9 requires a quality-checking validator that drives the ` +
            `PE-regress loop. Create the file or fix the path in VALIDATOR_FILES.`,
        );
      });
    }
  });

  // R9+ — validator enforces TIER_1_MIN_TOTAL_EVIDENCE (post-sweep invariant).
  //       The check was added in commit 22dd9e91. A new validator that forgets
  //       to import the constant will fail this assertion and must fix before merging.
  describe("R9+ — validator enforces TIER_1_MIN_TOTAL_EVIDENCE", () => {
    for (const def of assumptionTabSpecialists) {
      it(`${def.letter} ${def.humanName} (${def.id})`, () => {
        const relPath = VALIDATOR_FILES[def.id];
        if (!relPath) return; // completeness gate above covers missing entries

        const content = readFileOrNull(relPath);
        if (content === null) return; // R9 file-exists test covers missing files

        expect(content).toContain(
          "TIER_1_MIN_TOTAL_EVIDENCE",
          `Validator "${relPath}" does not import or reference TIER_1_MIN_TOTAL_EVIDENCE.\n` +
            `Every synthesis validator must enforce the ADR-003 invariant 7 total-evidence ` +
            `floor. Add check #5 from the sweep in commit 22dd9e91.`,
        );
      });
    }
  });
});
