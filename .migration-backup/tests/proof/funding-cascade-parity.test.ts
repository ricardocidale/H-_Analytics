/**
 * Funding Cascade Parity — proof test enforcing the four Funding Specialist
 * required-field columns stay aligned across schema, constants, seed, and
 * the Specialist catalog.
 *
 * Per `.claude/rules/inflation-cascade.md` (three-tier cascade) and
 * `.claude/rules/cross-check-invariants.md` ("edit one, verify many"):
 * adding or moving a Funding-Specialist field must update all four
 * surfaces in lockstep, otherwise the cascade silently breaks.
 *
 * Invariants asserted:
 *   1. Each of the 4 schema columns exists on `globalAssumptions` as a
 *      nullable real column. NULL is the inherit-from-Defaults sentinel.
 *   2. Each field has exactly one `model_defaults` SPECS row under
 *      card="funding" with subTab="funding" and the canonical
 *      `mc.funding.<field>` key (per packet g1.5b-funding-cascade-a — the
 *      Funding admin tab queries `WHERE sub_tab='funding'`).
 *   3. Each Default value is sourced from a named DEFAULT_* constant in
 *      `shared/constants-funding.ts` — never a numeric literal in the seed.
 *   4. The Funding Specialist's `candidateFields` list in
 *      `engine/analyst/registry/specialist-catalog.ts` covers the 4 schema
 *      columns plus the date-derived `trancheGapMonths` (5 total).
 *
 * Companion of `tests/proof/seed-schema-sync.test.ts` (general drift
 * detector) — this test is field-specific and asserts cross-surface parity,
 * not just presence-in-some-seed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { SPECS, toDefaultKey } from "../../script/seed-model-defaults";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";
import {
  DEFAULT_RUNWAY_BUFFER_MONTHS,
  DEFAULT_SIZING_OVERSHOOT_PCT,
  DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
  DEFAULT_BURN_FLEX_DOWN_PCT,
} from "../../shared/constants-funding";

const ROOT = join(__dirname, "../..");

/** The four Funding Specialist columns added to `globalAssumptions` in S1. */
const FUNDING_FIELDS = [
  {
    camel: "runwayBufferMonths",
    snake: "runway_buffer_months",
    constantName: "DEFAULT_RUNWAY_BUFFER_MONTHS",
    constantValue: DEFAULT_RUNWAY_BUFFER_MONTHS,
    unit: "months",
  },
  {
    camel: "sizingOvershootPct",
    snake: "sizing_overshoot_pct",
    constantName: "DEFAULT_SIZING_OVERSHOOT_PCT",
    constantValue: DEFAULT_SIZING_OVERSHOOT_PCT,
    unit: "%",
  },
  {
    camel: "revenueRampDelayMonths",
    snake: "revenue_ramp_delay_months",
    constantName: "DEFAULT_REVENUE_RAMP_DELAY_MONTHS",
    constantValue: DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
    unit: "months",
  },
  {
    camel: "burnFlexDownPct",
    snake: "burn_flex_down_pct",
    constantName: "DEFAULT_BURN_FLEX_DOWN_PCT",
    constantValue: DEFAULT_BURN_FLEX_DOWN_PCT,
    unit: "%",
  },
] as const;

/** Date-derived field — declared on the Specialist but not its own schema column. */
const TRANCHE_GAP_FIELD = "trancheGapMonths";

describe("Funding Cascade Parity (g1.5b — three-tier cascade for the Funding Specialist)", () => {
  // ── 1. Schema columns ────────────────────────────────────────────────
  describe("schema columns on globalAssumptions", () => {
    const schemaSrc = readFileSync(join(ROOT, "shared/schema/config.ts"), "utf-8");

    for (const field of FUNDING_FIELDS) {
      it(`${field.camel} is declared as a nullable real column on globalAssumptions`, () => {
        // Loose match: the column declaration line for `<camelName>: real("<snake_name>")`
        // without `.notNull()` (because NULL is the inherit-from-Defaults sentinel).
        const decl = new RegExp(
          `\\b${field.camel}\\s*:\\s*real\\(\\s*["']${field.snake}["']\\s*\\)`,
        );
        expect(
          decl.test(schemaSrc),
          `Expected globalAssumptions to declare \`${field.camel}: real("${field.snake}")\` ` +
            `in shared/schema/config.ts. Add the column per ` +
            `.claude/replit-handoffs/g1.5b-funding-cascade-a.md S1.`,
        ).toBe(true);

        // Walk a small window around the match and ensure the same line is NOT
        // hardened with .notNull() — that would break the inherit-from-Defaults
        // semantics that the cascade relies on.
        const m = decl.exec(schemaSrc);
        if (m) {
          const lineEnd = schemaSrc.indexOf("\n", m.index);
          const line = schemaSrc.slice(m.index, lineEnd === -1 ? undefined : lineEnd);
          expect(
            /\.notNull\(\)/.test(line),
            `Column \`${field.camel}\` must be nullable (NULL = inherit from model_defaults). ` +
              `Remove the .notNull() chain.`,
          ).toBe(false);
        }
      });
    }
  });

  // ── 2. model_defaults seed rows ──────────────────────────────────────
  describe("model_defaults seed rows", () => {
    for (const field of FUNDING_FIELDS) {
      const expectedKey = toDefaultKey("funding", field.camel);

      it(`${field.camel} has exactly one funding-card SPECS row with key "${expectedKey}"`, () => {
        const matches = SPECS.filter(
          (spec) => spec.card === "funding" && spec.key === field.camel,
        );
        expect(
          matches.length,
          `Expected one SPECS row in script/seed-model-defaults.ts with ` +
            `card="funding" and key="${field.camel}", found ${matches.length}.`,
        ).toBe(1);

        const row = matches[0];
        expect(toDefaultKey(row.card, row.key)).toBe(expectedKey);
        expect(row.unit).toBe(field.unit);

        // Packet-locked grouping: the Funding admin tab + the SQL audit query
        // (`SELECT ... FROM model_defaults WHERE sub_tab='funding'`) both rely on
        // these rows landing under sub_tab="funding". A drift here would silently
        // hide the rows from the admin UI and the rollback query.
        expect(
          row.subTab,
          `Funding cascade SPECS row "${field.camel}" must declare ` +
            `subTab: "funding" so it persists with sub_tab='funding' (per packet ` +
            `g1.5b-funding-cascade-a, model_defaults verification block).`,
        ).toBe("funding");
      });

      // ── 3. Default value sourced from named constant ─────────────────
      it(`${field.camel} seed value === ${field.constantName} (no literal duplication)`, () => {
        const row = SPECS.find(
          (spec) => spec.card === "funding" && spec.key === field.camel,
        );
        expect(row).toBeDefined();
        expect(
          row!.value,
          `Seed value for ${field.camel} must equal ${field.constantName} ` +
            `(${field.constantValue}); found ${String(row!.value)}. The seed must ` +
            `import the named constant from shared/constants-funding.ts, never a literal.`,
        ).toBe(field.constantValue);
      });
    }

    it("the seed source file imports each DEFAULT_* constant by name", () => {
      const seedSrc = readFileSync(join(ROOT, "script/seed-model-defaults.ts"), "utf-8");
      for (const field of FUNDING_FIELDS) {
        expect(
          seedSrc.includes(field.constantName),
          `script/seed-model-defaults.ts must reference ${field.constantName} by name, ` +
            `not a literal value. Import it from "../shared/constants-funding".`,
        ).toBe(true);
      }
    });
  });

  // ── 4. Specialist catalog candidateFields ────────────────────────────
  describe("Funding Specialist candidateFields (mgmt-co.funding)", () => {
    const fundingSpecialist = SPECIALIST_CATALOG.find((d) => d.id === "mgmt-co.funding");

    it("the mgmt-co.funding Specialist exists in the catalog", () => {
      expect(fundingSpecialist).toBeDefined();
    });

    const candidateKeys = new Set(
      (fundingSpecialist?.candidateFields ?? []).map((cf) => cf.key),
    );

    for (const field of FUNDING_FIELDS) {
      it(`candidateFields includes ${field.camel}`, () => {
        expect(
          candidateKeys.has(field.camel),
          `Funding Specialist's candidateFields must include "${field.camel}". ` +
            `Add it to engine/analyst/registry/specialist-catalog.ts under the ` +
            `mgmt-co.funding entry.`,
        ).toBe(true);
      });
    }

    it(`candidateFields includes the date-derived ${TRANCHE_GAP_FIELD}`, () => {
      expect(
        candidateKeys.has(TRANCHE_GAP_FIELD),
        `${TRANCHE_GAP_FIELD} is derived from capitalRaise1Date + capitalRaise2Date ` +
          `but must still appear in candidateFields so the Specialist can read it.`,
      ).toBe(true);
    });

    it("candidateFields covers exactly the 4 schema columns + trancheGapMonths (no drift)", () => {
      const expected = new Set([
        ...FUNDING_FIELDS.map((f) => f.camel),
        TRANCHE_GAP_FIELD,
      ]);
      const extra = [...candidateKeys].filter((k) => !expected.has(k));
      const missing = [...expected].filter((k) => !candidateKeys.has(k));
      expect(
        { extra, missing },
        `Funding Specialist candidateFields drifted from the locked 5-field set. ` +
          `Expected exactly: ${[...expected].sort().join(", ")}.`,
      ).toEqual({ extra: [], missing: [] });
    });
  });
});
