import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import {
  ENGINE_VERSION,
  SYNTHESIS_FINGERPRINT,
  COGNITIVE_MODEL_VERSIONS,
} from "../../server/ai/engine-version";

/**
 * Engine Version Drift (ADR-004 prerequisite).
 *
 * The verdict cache keys on `engineVersion`. If someone changes synthesis
 * semantics without bumping `ENGINE_VERSION`, we'd serve stale reasoning
 * as fresh. This test makes that silent drift impossible.
 *
 * When you see this fail: you changed `synthesis-schema.ts` or
 * `research-prompt-builders.ts` or a model constant. Update
 * `server/ai/engine-version.ts` to match, bump `ENGINE_VERSION`, and
 * re-run. The failure IS the point.
 */

const ROOT = path.resolve(__dirname, "../..");

const FINGERPRINTED_FILES = [
  path.join(ROOT, "server/ai/synthesis-schema.ts"),
  path.join(ROOT, "server/ai/research-prompt-builders.ts"),
];

const ORCHESTRATOR_PATH = path.join(ROOT, "server/ai/research-orchestrator.ts");

function computeFingerprint(): string {
  const contents = FINGERPRINTED_FILES.map((p) => fs.readFileSync(p, "utf-8")).join("");
  return crypto.createHash("sha256").update(contents).digest("hex");
}

describe("Engine Version Drift (ADR-004)", () => {
  it("SYNTHESIS_FINGERPRINT matches the actual hash of synthesis-schema.ts + research-prompt-builders.ts", () => {
    const actual = computeFingerprint();
    if (actual !== SYNTHESIS_FINGERPRINT) {
      throw new Error(
        `Synthesis fingerprint drift detected.\n\n` +
          `Declared (in server/ai/engine-version.ts): ${SYNTHESIS_FINGERPRINT}\n` +
          `Actual (hash of current files):            ${actual}\n\n` +
          `One of the following changed:\n` +
          `  - server/ai/synthesis-schema.ts (FIELD_DEFINITIONS, SynthesisOutputSchema)\n` +
          `  - server/ai/research-prompt-builders.ts (prompt templates)\n\n` +
          `Either change is a Cognitive Engine semantic change. To fix:\n` +
          `  1. Bump ENGINE_VERSION in server/ai/engine-version.ts (e.g. "v1-...-a" → "v1-...-b").\n` +
          `  2. Replace SYNTHESIS_FINGERPRINT with the new hash: ${actual}\n` +
          `  3. If the change affects the verdict cache (ADR-004), this ensures cold invalidation.`,
      );
    }
    expect(actual).toBe(SYNTHESIS_FINGERPRINT);
  });

  it("ENGINE_VERSION follows the expected format (v<n>-YYYY-MM-DD-<letter>)", () => {
    expect(ENGINE_VERSION).toMatch(/^v\d+-\d{4}-\d{2}-\d{2}-[a-z]$/);
  });

  it("COGNITIVE_MODEL_VERSIONS stays in sync with research-orchestrator.ts DEFAULT_* constants", () => {
    const src = fs.readFileSync(ORCHESTRATOR_PATH, "utf-8");
    const patterns: Array<[keyof typeof COGNITIVE_MODEL_VERSIONS, RegExp]> = [
      ["analystA", /DEFAULT_ANALYST_A_MODEL\s*=\s*"([^"]+)"/],
      ["analystB", /DEFAULT_ANALYST_B_MODEL\s*=\s*"([^"]+)"/],
      ["synthesis", /DEFAULT_SYNTHESIS_MODEL\s*=\s*"([^"]+)"/],
    ];
    for (const [role, pattern] of patterns) {
      const match = src.match(pattern);
      expect(match, `could not find ${role} model in research-orchestrator.ts`).toBeTruthy();
      const actualModel = match?.[1];
      const declaredModel = COGNITIVE_MODEL_VERSIONS[role];
      if (actualModel !== declaredModel) {
        throw new Error(
          `Model drift for ${role}:\n` +
            `  research-orchestrator.ts: "${actualModel}"\n` +
            `  engine-version.ts:        "${declaredModel}"\n\n` +
            `Update COGNITIVE_MODEL_VERSIONS.${role} in server/ai/engine-version.ts ` +
            `and bump ENGINE_VERSION.`,
        );
      }
    }
  });
});
