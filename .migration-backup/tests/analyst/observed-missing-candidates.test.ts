import { describe, it, expect } from "vitest";
import { findObservedMissingCandidateFields } from "../../engine/analyst/surface/mgmt-co";

describe("findObservedMissingCandidateFields", () => {
  const candidateFields = [
    { key: "runwayBufferMonths", label: "Runway", surface: "company-assumptions" as const },
    { key: "sizingOvershootPct", label: "Sizing", surface: "company-assumptions" as const },
    { key: "burnFlexDownPct", label: "Burn", surface: "company-assumptions" as const },
  ];

  it("returns only off-toggled candidate keys missing from the payload", () => {
    const payload = { runwayBufferMonths: 12 };
    const result = findObservedMissingCandidateFields(payload, candidateFields, {
      sizingOvershootPct: "off",
      burnFlexDownPct: "off",
    });
    expect(result.sort()).toEqual(["burnFlexDownPct", "sizingOvershootPct"]);
  });

  it("excludes fields toggled to recommended or hard from the recommendation list", () => {
    const payload = {};
    const result = findObservedMissingCandidateFields(payload, candidateFields, {
      runwayBufferMonths: "hard",
      sizingOvershootPct: "recommended",
      burnFlexDownPct: "off",
    });
    expect(result).toEqual(["burnFlexDownPct"]);
  });

  it("treats absent toggle entries as off", () => {
    const payload = {};
    const result = findObservedMissingCandidateFields(payload, candidateFields, {});
    expect(result.sort()).toEqual([
      "burnFlexDownPct",
      "runwayBufferMonths",
      "sizingOvershootPct",
    ]);
  });

  it("returns empty when all off-toggled candidates are present", () => {
    const payload = { runwayBufferMonths: 12, sizingOvershootPct: 5, burnFlexDownPct: 10 };
    const result = findObservedMissingCandidateFields(payload, candidateFields, {});
    expect(result).toEqual([]);
  });

  it("treats null/undefined fieldRequirements as everything-off", () => {
    const payload = { runwayBufferMonths: 12 };
    const result = findObservedMissingCandidateFields(payload, candidateFields, null);
    expect(result.sort()).toEqual(["burnFlexDownPct", "sizingOvershootPct"]);
  });
});
