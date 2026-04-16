import { describe, it, expect } from "vitest";
import {
  FIELD_REGISTRY,
  buildPropertyDefaultsFromRegistry,
  type FieldDefinition,
} from "../../shared/field-registry";
import { properties } from "../../shared/schema/properties";
import { globalAssumptions } from "../../shared/schema/config";

describe("FIELD_REGISTRY — schema parity", () => {
  const propertyColumns = Object.keys(properties as Record<string, unknown>);
  const gaColumns = Object.keys(globalAssumptions as Record<string, unknown>);

  it("every registry propertyField exists in the properties schema", () => {
    for (const field of FIELD_REGISTRY) {
      expect(
        propertyColumns,
        `Property field "${field.propertyField}" missing from properties schema`,
      ).toContain(field.propertyField);
    }
  });

  it("every direct gaSource.gaField exists in the globalAssumptions schema", () => {
    const directFields = FIELD_REGISTRY.filter(
      (f): f is FieldDefinition & { gaSource: { kind: "direct"; gaField: string } } =>
        f.gaSource.kind === "direct",
    );
    for (const field of directFields) {
      expect(
        gaColumns,
        `GA field "${field.gaSource.gaField}" (for property "${field.propertyField}") missing from globalAssumptions schema`,
      ).toContain(field.gaSource.gaField);
    }
  });

  it("every debt gaSource.debtField is a valid DebtAssumptions key", () => {
    const validDebtKeys = [
      "acqLTV",
      "refiLTV",
      "interestRate",
      "amortizationYears",
      "acqClosingCostRate",
      "refiClosingCostRate",
    ];
    const debtFields = FIELD_REGISTRY.filter(
      (f): f is FieldDefinition & { gaSource: { kind: "debt"; debtField: string } } =>
        f.gaSource.kind === "debt",
    );
    for (const field of debtFields) {
      expect(
        validDebtKeys,
        `Debt field "${field.gaSource.debtField}" (for property "${field.propertyField}") is not a valid DebtAssumptions key`,
      ).toContain(field.gaSource.debtField);
    }
  });

  it("has no duplicate propertyField entries", () => {
    const seen = new Set<string>();
    for (const field of FIELD_REGISTRY) {
      expect(seen.has(field.propertyField), `Duplicate propertyField: ${field.propertyField}`).toBe(false);
      seen.add(field.propertyField);
    }
  });
});

describe("buildPropertyDefaultsFromRegistry", () => {
  it("returns all registry fields when no GA is provided", () => {
    const defaults = buildPropertyDefaultsFromRegistry();
    for (const field of FIELD_REGISTRY) {
      expect(defaults).toHaveProperty(field.propertyField);
      expect(
        defaults[field.propertyField],
        `${field.propertyField} should equal its fallback (${field.fallback})`,
      ).toBe(field.fallback);
    }
  });

  it("returns all registry fields when GA is null", () => {
    const defaults = buildPropertyDefaultsFromRegistry(null);
    for (const field of FIELD_REGISTRY) {
      expect(defaults).toHaveProperty(field.propertyField);
      expect(defaults[field.propertyField]).toBe(field.fallback);
    }
  });

  it("prefers GA direct field values over fallbacks", () => {
    const ga = { exitCapRate: 0.07, defaultCostRateRooms: 0.25 } as Record<string, unknown>;
    const defaults = buildPropertyDefaultsFromRegistry(ga);
    expect(defaults.exitCapRate).toBe(0.07);
    expect(defaults.costRateRooms).toBe(0.25);
  });

  it("prefers GA debt field values over fallbacks", () => {
    const ga = {
      debtAssumptions: { acqLTV: 0.80, refiLTV: 0.60 },
    } as Record<string, unknown>;
    const defaults = buildPropertyDefaultsFromRegistry(ga);
    expect(defaults.acquisitionLTV).toBe(0.80);
    expect(defaults.refinanceLTV).toBe(0.60);
  });

  it("covers exactly the same fields as the old hand-coded function", () => {
    const expectedFields = [
      "exitCapRate",
      "taxRate",
      "dispositionCommission",
      "baseManagementFeeRate",
      "incentiveManagementFeeRate",
      "startAdr",
      "adrGrowthRate",
      "startOccupancy",
      "maxOccupancy",
      "occupancyRampMonths",
      "roomCount",
      "cateringBoostPercent",
      "costRateRooms",
      "costRateFB",
      "costRateAdmin",
      "costRateMarketing",
      "costRatePropertyOps",
      "costRateUtilities",
      "costRateTaxes",
      "costRateIT",
      "costRateFFE",
      "costRateOther",
      "costRateInsurance",
      "revShareEvents",
      "revShareFB",
      "revShareOther",
      "landValuePercent",
      "acquisitionLTV",
      "acquisitionInterestRate",
      "acquisitionTermYears",
      "acquisitionClosingCostRate",
      "refinanceLTV",
      "refinanceInterestRate",
      "refinanceTermYears",
      "refinanceClosingCostRate",
    ];
    const defaults = buildPropertyDefaultsFromRegistry();
    const registryFields = Object.keys(defaults).sort();
    expect(registryFields).toEqual(expectedFields.sort());
  });

  it("every fallback is a finite number", () => {
    for (const field of FIELD_REGISTRY) {
      expect(
        Number.isFinite(field.fallback),
        `${field.propertyField} fallback (${field.fallback}) is not a finite number`,
      ).toBe(true);
    }
  });

  it("every rate-type field has fallback between 0 and 1 inclusive", () => {
    const rateFields = FIELD_REGISTRY.filter((f) => f.type === "rate");
    expect(rateFields.length).toBeGreaterThan(0);
    for (const field of rateFields) {
      expect(
        field.fallback >= 0 && field.fallback <= 1,
        `${field.propertyField} fallback (${field.fallback}) is not in [0, 1]`,
      ).toBe(true);
    }
  });

  it("every integer-type field has a whole-number fallback", () => {
    const intFields = FIELD_REGISTRY.filter((f) => f.type === "integer");
    expect(intFields.length).toBeGreaterThan(0);
    for (const field of intFields) {
      expect(
        Number.isInteger(field.fallback),
        `${field.propertyField} fallback (${field.fallback}) is not an integer`,
      ).toBe(true);
    }
  });

  it("every field with validationMin has fallback >= validationMin", () => {
    for (const field of FIELD_REGISTRY) {
      if (field.validationMin != null) {
        expect(
          field.fallback >= field.validationMin,
          `${field.propertyField} fallback (${field.fallback}) < validationMin (${field.validationMin})`,
        ).toBe(true);
      }
    }
  });

  it("every field with validationMax has fallback <= validationMax", () => {
    for (const field of FIELD_REGISTRY) {
      if (field.validationMax != null) {
        expect(
          field.fallback <= field.validationMax,
          `${field.propertyField} fallback (${field.fallback}) > validationMax (${field.validationMax})`,
        ).toBe(true);
      }
    }
  });

  it("every field has engineImpact set to true", () => {
    for (const field of FIELD_REGISTRY) {
      expect(
        field.engineImpact,
        `${field.propertyField} should have engineImpact=true`,
      ).toBe(true);
    }
  });

  it("registry has at least one field per category", () => {
    const categories = new Set(FIELD_REGISTRY.map((f) => f.category));
    const expected: FieldDefinition["category"][] = ["exit", "revenue", "cost-rate", "management-fee", "operating", "debt-acquisition", "debt-refinance"];
    for (const cat of expected) {
      expect(categories.has(cat), `Missing category: ${cat}`).toBe(true);
    }
  });
});
