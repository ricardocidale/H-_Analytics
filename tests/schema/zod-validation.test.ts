import { describe, it, expect } from "vitest";
import {
  updateScenarioSchema,
  updateServiceTemplateSchema,
  updateFeeCategorySchema,
  insertResearchQuestionSchema,
} from "../../shared/schema";

/**
 * Schema Validation Tests
 *
 * Tests Zod schemas from shared/schema.ts for edge cases:
 * missing required fields, wrong types, boundary values.
 */

describe("updateScenarioSchema", () => {
  it("accepts valid update with name", () => {
    const result = updateScenarioSchema.safeParse({ name: "Test Scenario" });
    expect(result.success).toBe(true);
  });

  it("accepts valid update with description", () => {
    const result = updateScenarioSchema.safeParse({ description: "A test description" });
    expect(result.success).toBe(true);
  });

  it("accepts null description", () => {
    const result = updateScenarioSchema.safeParse({ description: null });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    const result = updateScenarioSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-string name", () => {
    const result = updateScenarioSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
  });

  it("rejects non-string description", () => {
    const result = updateScenarioSchema.safeParse({ description: 123 });
    expect(result.success).toBe(false);
  });
});

describe("updateServiceTemplateSchema", () => {
  it("accepts valid partial update", () => {
    const result = updateServiceTemplateSchema.safeParse({ name: "Marketing & Brand" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateServiceTemplateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts rate at boundaries (0 and 1)", () => {
    expect(updateServiceTemplateSchema.safeParse({ defaultRate: 0 }).success).toBe(true);
    expect(updateServiceTemplateSchema.safeParse({ defaultRate: 1 }).success).toBe(true);
  });

  it("rejects rate below 0", () => {
    const result = updateServiceTemplateSchema.safeParse({ defaultRate: -0.01 });
    expect(result.success).toBe(false);
  });

  it("rejects rate above 1", () => {
    const result = updateServiceTemplateSchema.safeParse({ defaultRate: 1.01 });
    expect(result.success).toBe(false);
  });

  it("accepts valid serviceModel values", () => {
    expect(updateServiceTemplateSchema.safeParse({ serviceModel: "centralized" }).success).toBe(true);
    expect(updateServiceTemplateSchema.safeParse({ serviceModel: "direct" }).success).toBe(true);
  });

  it("rejects invalid serviceModel", () => {
    const result = updateServiceTemplateSchema.safeParse({ serviceModel: "hybrid" });
    expect(result.success).toBe(false);
  });

  it("accepts markup at boundaries", () => {
    expect(updateServiceTemplateSchema.safeParse({ serviceMarkup: 0 }).success).toBe(true);
    expect(updateServiceTemplateSchema.safeParse({ serviceMarkup: 1 }).success).toBe(true);
  });

  it("rejects markup above 1", () => {
    expect(updateServiceTemplateSchema.safeParse({ serviceMarkup: 1.5 }).success).toBe(false);
  });

  it("accepts boolean isActive", () => {
    expect(updateServiceTemplateSchema.safeParse({ isActive: true }).success).toBe(true);
    expect(updateServiceTemplateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("rejects non-boolean isActive", () => {
    expect(updateServiceTemplateSchema.safeParse({ isActive: "yes" }).success).toBe(false);
  });
});

describe("updateFeeCategorySchema", () => {
  it("accepts valid partial update", () => {
    const result = updateFeeCategorySchema.safeParse({ name: "Technology & Reservations", rate: 0.025 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(updateFeeCategorySchema.safeParse({}).success).toBe(true);
  });

  it("rejects non-string name", () => {
    expect(updateFeeCategorySchema.safeParse({ name: 42 }).success).toBe(false);
  });

  it("rejects non-number rate", () => {
    expect(updateFeeCategorySchema.safeParse({ rate: "five" }).success).toBe(false);
  });
});

describe("insertResearchQuestionSchema", () => {
  it("accepts valid question", () => {
    const result = insertResearchQuestionSchema.safeParse({ question: "What is the cap rate?" });
    expect(result.success).toBe(true);
  });

  it("rejects missing question", () => {
    const result = insertResearchQuestionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string question", () => {
    const result = insertResearchQuestionSchema.safeParse({ question: 123 });
    expect(result.success).toBe(false);
  });

  it("rejects empty string question", () => {
    const result = insertResearchQuestionSchema.safeParse({ question: "" });
    expect(result.success).toBe(false);
  });
});
