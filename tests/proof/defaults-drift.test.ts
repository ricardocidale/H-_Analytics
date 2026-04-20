/**
 * Defaults-Drift Detector — proof test catching seed-vs-constant divergence.
 *
 * The `model_defaults` table is seeded from named constants in `shared/constants.ts`
 * (see `script/seed-model-defaults.ts`). Once seeded, the two live independently:
 *
 *   - A server edge (e.g. `server/routes/chat.ts`) reads via `resolveDefault()`
 *     which hits the DB value.
 *   - Other consumers still import the constant directly from `shared/constants.ts`.
 *
 * If someone edits the constant without re-seeding (or edits the seed value
 * without touching the constant), the two silently drift and the app gives
 * inconsistent answers depending on which path is used. This test compares,
 * for every seeded key, the live DB value against the live in-code constant
 * it was seeded from.
 *
 * To resolve a drift flag:
 *   1. Decide which value is correct (constant or DB).
 *   2. If constant is correct:  `tsx script/seed-model-defaults.ts`
 *      (upserts the new constant value into the DB).
 *   3. If DB is correct: update `shared/constants.ts`.
 *
 * This is the "edit one, verify many" guard from
 * `.claude/rules/cross-check-invariants.md` §"Pattern 1 — Shared defaults".
 */
import { describe, it, expect } from "vitest";
import { resolveDefault } from "../../server/defaults";
import { SPECS, toDefaultKey } from "../../script/seed-model-defaults";

describe("Defaults drift — seed values match their paired constants", () => {
  for (const spec of SPECS) {
    const key = toDefaultKey(spec.card, spec.key);
    it(`${key} matches \`shared/constants.ts\``, async () => {
      const dbValue = await resolveDefault<unknown>(key);
      expect(
        dbValue,
        `DB value for ${key} is missing — re-run \`tsx script/seed-model-defaults.ts\``,
      ).toBeDefined();
      // JSON round-trip normalises jsonb decoding (dates → strings, etc.) so
      // arrays and nested objects compare structurally, not by reference.
      expect(JSON.parse(JSON.stringify(dbValue))).toEqual(
        JSON.parse(JSON.stringify(spec.value)),
      );
    });
  }

  it("every seeded key resolves (no orphaned specs)", async () => {
    const missing: string[] = [];
    for (const spec of SPECS) {
      const key = toDefaultKey(spec.card, spec.key);
      const v = await resolveDefault(key);
      if (v === undefined) missing.push(key);
    }
    expect(missing, `These seeded keys are not in the DB — re-run \`tsx script/seed-model-defaults.ts\`:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});
