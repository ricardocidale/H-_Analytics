import { describe, it, expect } from "vitest";
import {
  SPECIALIST_CATALOG,
  SPECIALIST_CATALOG_VALID,
  getSpecialistById,
  getSpecialistsBySubject,
} from "../../engine/analyst/registry/specialist-catalog";
import {
  SPECIALIST_LETTERS,
  SPECIALIST_CAPABILITIES,
  SUBJECTS,
  specialistDisplayLabel,
} from "../../shared/schema/specialist";
import {
  RESOURCE_KINDS,
  ResourceSlugSchema,
} from "../../shared/schema/admin-resource";

describe("SPECIALIST_CATALOG (P1 doctrine lock)", () => {
  it("self-validates at module load", () => {
    expect(SPECIALIST_CATALOG_VALID).toBe(true);
  });

  it("declares exactly 15 Specialists (A–G + Constants H–K + Resource Builder L + Compensation M + Overhead N + Company O)", () => {
    expect(SPECIALIST_CATALOG).toHaveLength(15);
  });

  it("assigns a unique humanName and a gender to every Specialist", () => {
    const names = SPECIALIST_CATALOG.map((d) => d.humanName);
    expect(new Set(names).size).toBe(names.length);
    for (const def of SPECIALIST_CATALOG) {
      expect(def.humanName).toMatch(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]*$/);
      expect(["male", "female"]).toContain(def.gender);
    }
  });

  it("places Letícia (Resource Builder) at letter L", () => {
    const leticia = SPECIALIST_CATALOG.find((d) => d.letter === "L");
    expect(leticia?.id).toBe("resources.builder");
    expect(leticia?.humanName).toBe("Letícia");
    expect(leticia?.subject).toBe("resources");
  });

  it("uses unique ids", () => {
    const ids = SPECIALIST_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses unique letters drawn from the registered SPECIALIST_LETTERS set", () => {
    const letters = SPECIALIST_CATALOG.map((d) => d.letter);
    expect(new Set(letters).size).toBe(letters.length);
    for (const l of letters) {
      expect(SPECIALIST_LETTERS).toContain(l);
    }
  });

  it("declares only valid subjects", () => {
    for (const def of SPECIALIST_CATALOG) {
      expect(SUBJECTS).toContain(def.subject);
    }
  });

  it("declares only whitelisted capabilities", () => {
    for (const def of SPECIALIST_CATALOG) {
      for (const cap of def.capabilities) {
        expect(SPECIALIST_CAPABILITIES).toContain(cap);
      }
    }
  });

  it("declares assignmentRefs of valid kind and kebab-case slug", () => {
    for (const def of SPECIALIST_CATALOG) {
      for (const ref of def.assignmentRefs) {
        expect(RESOURCE_KINDS).toContain(ref.kind);
        const parsed = ResourceSlugSchema.safeParse(ref.slug);
        expect(parsed.success).toBe(true);
      }
    }
  });

  it("requires Funding (A) and Revenue (B) to be built", () => {
    expect(getSpecialistById("mgmt-co.funding")?.status).toBe("built");
    expect(getSpecialistById("mgmt-co.revenue")?.status).toBe("built");
  });

  it("groups Specialists by subject for sidebar rendering", () => {
    const mgmtCo = getSpecialistsBySubject("mgmt-co");
    expect(mgmtCo.map((d) => d.id)).toContain("mgmt-co.funding");
    expect(mgmtCo.map((d) => d.id)).toContain("mgmt-co.revenue");
  });

  it("formats display labels as 'Specialist X — Name'", () => {
    const funding = getSpecialistById("mgmt-co.funding")!;
    expect(specialistDisplayLabel(funding)).toBe("Specialist A — Funding");
  });
});
