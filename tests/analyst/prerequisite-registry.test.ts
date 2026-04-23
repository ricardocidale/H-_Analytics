/**
 * Smoke tests for the prerequisite evaluator registry.
 *
 * The registry is the runtime "is this satisfied?" layer that backs the
 * Specialist prerequisite toggles. The contract being tested:
 *   1. A toggled-on prerequisite with no registered evaluator fails loudly
 *      (never silently passes).
 *   2. The built-in `all-properties-financials-computed` evaluator fails
 *      with a clear message when the user's property scope is empty, and
 *      passes when at least one property exists.
 *   3. Evaluator throws are caught and reported as failures (one bad
 *      evaluator can't break the whole gate).
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePrerequisites,
  registerPrerequisiteEvaluator,
  type PrerequisiteStorage,
} from "../../engine/analyst/registry/prerequisite-registry";

function makeStorage(properties: { id: number }[]): PrerequisiteStorage {
  return {
    async getAllProperties() {
      return properties;
    },
  };
}

describe("evaluatePrerequisites", () => {
  it("reports a failure for a toggled-on prerequisite with no registered evaluator", async () => {
    const failures = await evaluatePrerequisites(
      ["definitely-not-a-real-prereq-id"],
      { storage: makeStorage([]), userId: 1 },
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe("definitely-not-a-real-prereq-id");
    expect(failures[0].reason).toMatch(/no evaluator is registered/i);
  });

  it("returns no failures when no prereqs are toggled on", async () => {
    const failures = await evaluatePrerequisites([], {
      storage: makeStorage([]),
      userId: 1,
    });
    expect(failures).toEqual([]);
  });

  it("all-properties-financials-computed fails when the user has zero properties", async () => {
    const failures = await evaluatePrerequisites(
      ["all-properties-financials-computed"],
      { storage: makeStorage([]), userId: 1 },
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/no properties in scope/i);
  });

  it("all-properties-financials-computed passes when at least one property exists", async () => {
    const failures = await evaluatePrerequisites(
      ["all-properties-financials-computed"],
      { storage: makeStorage([{ id: 1 }]), userId: 1 },
    );
    expect(failures).toEqual([]);
  });

  it("catches evaluator throws and reports them as failures", async () => {
    // Register a one-off evaluator that throws.
    registerPrerequisiteEvaluator(
      "all-properties-financials-computed",
      async () => {
        throw new Error("boom");
      },
    );
    const failures = await evaluatePrerequisites(
      ["all-properties-financials-computed"],
      { storage: makeStorage([]), userId: 1 },
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/threw: boom/);

    // Restore the original evaluator so the rest of the suite stays clean.
    registerPrerequisiteEvaluator(
      "all-properties-financials-computed",
      async ({ storage, userId }) => {
        const props = await storage.getAllProperties(userId);
        if (props.length === 0) {
          return {
            ok: false,
            reason: "No properties in scope. Add at least one property before running this Specialist.",
          };
        }
        return { ok: true };
      },
    );
  });
});
