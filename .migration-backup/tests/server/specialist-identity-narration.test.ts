/**
 * Phase 3 (Task #453) — pronoun + name narration propagation test.
 *
 * Proves that flipping a Specialist's gender (or humanName) through the
 * IdentityTab override path immediately changes the narration text
 * produced by `narrateSpecialistHandoff()` — the canonical production
 * callsite that uses BOTH `humanName` and `pronounSet(gender).possessive`.
 *
 * This is the end-to-end coverage requested by the architect re-review:
 *   identity override change → next narration call → assertion on text.
 *
 * Storage is mocked so we can flip the override mid-test without a DB.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../server/storage", () => ({
  storage: {
    getIdentityOverride: vi.fn(),
    listIdentityOverrides: vi.fn().mockResolvedValue([]),
  },
}));

import { storage } from "../../server/storage";
import { narrateSpecialistHandoff } from "../../server/lib/specialist-identity-resolver";

const helena = "constants.tax-research"; // Catalog default: humanName "Helena", gender "female"
const orchestrator = "gaspar";            // Catalog default: humanName "Gaspar",  gender "male"

describe("Phase 3 (#453) — narrateSpecialistHandoff: pronoun + name propagation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("with no override, uses catalog default name AND female possessive ('her')", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const out = await narrateSpecialistHandoff(helena, "tax bulletin diff");
    expect(out).toBe("Helena finished her tax bulletin diff.");
  });

  it("flipping gender to 'male' via override flips 'her' → 'his' on next call", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: helena,
      humanName: null,
      gender: "male",
      updatedByUserId: 99,
      updatedAt: new Date(),
    });
    const out = await narrateSpecialistHandoff(helena, "tax bulletin diff");
    expect(out).toBe("Helena finished his tax bulletin diff.");
  });

  it("flipping gender to 'neutral' via override flips 'her' → 'their' on next call", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: helena,
      humanName: null,
      gender: "neutral",
      updatedByUserId: 99,
      updatedAt: new Date(),
    });
    const out = await narrateSpecialistHandoff(helena, "tax bulletin diff");
    expect(out).toBe("Helena finished their tax bulletin diff.");
  });

  it("renaming AND flipping gender in one override changes both name and pronoun", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: helena,
      humanName: "Helena Souza",
      gender: "neutral",
      updatedByUserId: 99,
      updatedAt: new Date(),
    });
    const out = await narrateSpecialistHandoff(helena, "tax bulletin diff");
    expect(out).toBe("Helena Souza finished their tax bulletin diff.");
  });

  it("Gustavo (orchestrator) defaults to 'his' as a male persona", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const out = await narrateSpecialistHandoff(orchestrator, "synthesis");
    expect(out).toBe("Gustavo finished his synthesis.");
  });

  it("Gustavo can be flipped to female via override and pronoun follows", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      specialistId: orchestrator,
      humanName: null,
      gender: "female",
      updatedByUserId: 99,
      updatedAt: new Date(),
    });
    const out = await narrateSpecialistHandoff(orchestrator, "synthesis");
    expect(out).toBe("Gustavo finished her synthesis.");
  });

  it("unknown specialist id falls back to a neutral, pronoun-free line and never throws", async () => {
    (storage.getIdentityOverride as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const out = await narrateSpecialistHandoff("does.not.exist", "phantom work");
    expect(out).toBe("does.not.exist finished phantom work.");
    // Storage was not consulted for the override either, because the
    // catalog lookup short-circuits the unknown id (no override read).
  });
});
