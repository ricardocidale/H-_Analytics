/**
 * Constants → Specialist coverage test (Phase 1 doctrine lock).
 *
 * The locked principle: every governed Model Constant in
 * `MODEL_CONSTANTS_REGISTRY` MUST be owned by exactly one AI Intelligence
 * Specialist (declared via `constantsOwned[]` in
 * `engine/analyst/registry/specialist-catalog.ts`). This is what makes the
 * "Refresh research" button on the Constants tab routable: the route resolver
 * needs a single owner to dispatch to.
 *
 * Adding a new key to MODEL_CONSTANTS_REGISTRY without assigning an owner —
 * or splitting an owner across two Specialists — breaks Constants doctrine.
 * Catch the drift here at build time, not in production.
 */

import { describe, it, expect } from "vitest";
import {
  SPECIALIST_CATALOG,
  getSpecialistForConstant,
} from "../../engine/analyst/registry/specialist-catalog";
import { MODEL_CONSTANTS_REGISTRY } from "../../shared/model-constants-registry";

describe("Model Constants → Specialist ownership coverage", () => {
  // Only specialist-owned (authority-sourced) constants need a Specialist
  // claim — the doctrine is that admins can directly edit non-specialist-
  // owned entries (e.g. industry-survey calibration values like the operating
  // structure overlays in Task #809). The `Phase 3` double-lock test below
  // still enforces the inverse: a `specialistOwned: false` entry MUST NOT be
  // claimed by any Specialist.
  const registryKeys = Object.keys(MODEL_CONSTANTS_REGISTRY);
  const specialistOwnedKeys = Object.entries(MODEL_CONSTANTS_REGISTRY)
    .filter(([, entry]) => entry.specialistOwned === true)
    .map(([k]) => k);

  it("every specialist-owned constant has exactly one owning Specialist", () => {
    const claims = new Map<string, string[]>();
    for (const def of SPECIALIST_CATALOG) {
      for (const key of def.constantsOwned ?? []) {
        const list = claims.get(key) ?? [];
        list.push(def.id);
        claims.set(key, list);
      }
    }

    const unowned: string[] = [];
    const overOwned: { key: string; owners: string[] }[] = [];
    for (const key of specialistOwnedKeys) {
      const owners = claims.get(key) ?? [];
      if (owners.length === 0) unowned.push(key);
      else if (owners.length > 1) overOwned.push({ key, owners });
    }

    expect(
      unowned,
      `Specialist-owned registry keys with no owning Specialist (assign each in constantsOwned[]): ${unowned.join(", ")}`,
    ).toHaveLength(0);
    expect(
      overOwned,
      `Constants registry keys claimed by multiple Specialists: ${overOwned
        .map((o) => `${o.key} → [${o.owners.join(", ")}]`)
        .join("; ")}`,
    ).toHaveLength(0);
  });

  it("getSpecialistForConstant resolves every specialist-owned registry key", () => {
    for (const key of specialistOwnedKeys) {
      const owner = getSpecialistForConstant(key);
      expect(owner, `No Specialist resolved for constant '${key}'`).toBeDefined();
      expect(owner!.subject).toBe("constants");
    }
  });

  it("rejects unknown keys with undefined (defensive)", () => {
    expect(getSpecialistForConstant("not-a-real-constant-xyz")).toBeUndefined();
  });

  it("Phase 3: every specialistOwned registry key is also claimed by a Specialist (catalog ↔ registry double-lock)", () => {
    // The Phase 3 server guard keys off `entry.specialistOwned`. The
    // ownership coverage test above keys off `def.constantsOwned[]`. If
    // these two signals ever drift apart — e.g. a registry entry is
    // marked specialistOwned but no Specialist actually claims it — the
    // guard rejects writes that no AI Specialist will produce, leaving
    // the constant uneditable. Lock the two signals together.
    const drift: { key: string; reason: string }[] = [];
    for (const [key, entry] of Object.entries(MODEL_CONSTANTS_REGISTRY)) {
      const owner = getSpecialistForConstant(key);
      if (entry.specialistOwned && !owner) {
        drift.push({ key, reason: "specialistOwned=true but no Specialist claims it via constantsOwned[]" });
      }
      if (!entry.specialistOwned && owner) {
        drift.push({
          key,
          reason: `claimed by Specialist '${owner.id}' but registry has specialistOwned=false`,
        });
      }
    }
    expect(
      drift,
      `Constants registry ↔ Specialist catalog drift detected:\n${drift
        .map((d) => `  - ${d.key}: ${d.reason}`)
        .join("\n")}`,
    ).toHaveLength(0);
  });

  it("never claims an unknown key (catalog → registry alignment)", () => {
    const knownKeys = new Set(registryKeys);
    const orphans: { specialistId: string; key: string }[] = [];
    for (const def of SPECIALIST_CATALOG) {
      for (const key of def.constantsOwned ?? []) {
        if (!knownKeys.has(key)) orphans.push({ specialistId: def.id, key });
      }
    }
    expect(
      orphans,
      `Specialists claim constants not in MODEL_CONSTANTS_REGISTRY: ${orphans
        .map((o) => `${o.specialistId} → '${o.key}'`)
        .join("; ")}`,
    ).toHaveLength(0);
  });
});
