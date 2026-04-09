import { describe, it, expect } from "vitest";
import { stripAutoFields } from "../../server/storage/utils";
import * as fs from "fs";
import * as path from "path";

const storageDir = path.resolve(__dirname, "../../server/storage");

function readStorageFile(name: string): string {
  return fs.readFileSync(path.join(storageDir, name), "utf-8");
}

describe("stripAutoFields — unit tests", () => {
  it("removes id from data", () => {
    const data = { id: 42, name: "Test", value: 100 };
    const result = stripAutoFields(data);
    expect(result).not.toHaveProperty("id");
    expect(result).toHaveProperty("name", "Test");
    expect(result).toHaveProperty("value", 100);
  });

  it("removes createdAt from data", () => {
    const data = { createdAt: new Date("2026-01-01"), name: "Test" };
    const result = stripAutoFields(data);
    expect(result).not.toHaveProperty("createdAt");
    expect(result).toHaveProperty("name", "Test");
  });

  it("removes updatedAt from data", () => {
    const data = { updatedAt: new Date("2026-01-01"), name: "Test" };
    const result = stripAutoFields(data);
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).toHaveProperty("name", "Test");
  });

  it("removes all three auto fields simultaneously", () => {
    const data = {
      id: 9,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-03-06"),
      name: "Config",
      enabledFlag: true,
      agentId: "agent_abc123",
    };
    const result = stripAutoFields(data);
    expect(Object.keys(result)).toEqual(["name", "enabledFlag", "agentId"]);
  });

  it("returns all fields when no auto fields present", () => {
    const data = { name: "Test", value: 42, flag: true };
    const result = stripAutoFields(data);
    expect(result).toEqual(data);
  });

  it("handles empty object", () => {
    const result = stripAutoFields({});
    expect(result).toEqual({});
  });

  it("handles object with only auto fields", () => {
    const data = { id: 1, createdAt: new Date(), updatedAt: new Date() };
    const result = stripAutoFields(data);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("preserves nested objects and arrays", () => {
    const data = {
      id: 5,
      colors: [{ name: "primary", hex: "#000" }],
      config: { key: "value" },
    };
    const result = stripAutoFields(data);
    expect(result).toEqual({
      colors: [{ name: "primary", hex: "#000" }],
      config: { key: "value" },
    });
  });

  it("preserves null and undefined field values", () => {
    const data = { id: 1, name: null, description: undefined, active: false };
    const result = stripAutoFields(data);
    expect(result).toEqual({ name: null, description: undefined, active: false });
  });

  it("preserves numeric zero and empty string values", () => {
    const data = { id: 1, rate: 0, label: "" };
    const result = stripAutoFields(data);
    expect(result).toEqual({ rate: 0, label: "" });
  });
});

describe("Storage Layer — stripAutoFields integration (static analysis)", () => {
  const utilsSrc = readStorageFile("utils.ts");

  it("utils.ts exports stripAutoFields function", () => {
    expect(utilsSrc).toContain("export function stripAutoFields");
  });

  it("stripAutoFields destructures id, createdAt, and updatedAt", () => {
    expect(utilsSrc).toContain("id: _id");
    expect(utilsSrc).toContain("createdAt: _ca");
    expect(utilsSrc).toContain("updatedAt: _ua");
  });
});

describe("Storage Layer — all update methods use stripAutoFields", () => {
  describe("financial.ts", () => {
    const src = readStorageFile("financial.ts");
    const feesSrc = readStorageFile("financial-fees.ts");

    it("imports stripAutoFields", () => {
      expect(src).toContain('import { stripAutoFields } from "./utils"');
    });

    it("upsertGlobalAssumptions uses stripAutoFields in update path", () => {
      const methodStart = src.indexOf("async upsertGlobalAssumptions(");
      const methodEnd = src.indexOf("async createScenario(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });

    it("updateScenario uses stripAutoFields", () => {
      const methodStart = src.indexOf("async updateScenario(");
      const methodEnd = src.indexOf("async updateScenarioComputedResults(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });

    it("updateFeeCategory uses stripAutoFields", () => {
      const methodStart = feesSrc.indexOf("async updateFeeCategory(");
      const methodEnd = feesSrc.indexOf("async deleteFeeCategory(");
      const body = feesSrc.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });

    it("loadScenario strips auto fields from restored global assumptions", () => {
      const methodStart = src.indexOf("async loadScenario(");
      const methodEnd = src.indexOf("async getFeeCategoriesByProperty(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("id: _gaId");
      expect(body).toContain("createdAt: _gaCreated");
      expect(body).toContain("updatedAt: _gaUpdated");
    });
  });

  describe("properties.ts", () => {
    const src = readStorageFile("properties.ts");

    it("imports stripAutoFields", () => {
      expect(src).toContain('import { stripAutoFields } from "./utils"');
    });

    it("updateProperty uses stripAutoFields", () => {
      const methodStart = src.indexOf("async updateProperty(");
      const methodEnd = src.indexOf("async deleteProperty(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });
  });

  describe("admin.ts", () => {
    const src = readStorageFile("admin.ts");

    it("imports stripAutoFields", () => {
      expect(src).toContain('import { stripAutoFields } from "./utils"');
    });

    it("updateDesignTheme uses stripAutoFields", () => {
      const methodStart = src.indexOf("async updateDesignTheme(");
      const methodEnd = src.indexOf("async deleteDesignTheme(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });

    it("updateUserGroup uses stripAutoFields", () => {
      const methodStart = src.indexOf("async updateUserGroup(");
      const methodEnd = src.indexOf("async getDefaultUserGroup(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });

    it("updateCompany uses stripAutoFields", () => {
      const methodStart = src.indexOf("async updateCompany(");
      const delStart = src.indexOf("async deleteCompany(");
      const body = src.slice(src.indexOf("async updateCompany("), delStart);
      expect(body).toContain("stripAutoFields(");
    });
  });

  describe("services.ts", () => {
    const src = readStorageFile("services.ts");

    it("imports stripAutoFields", () => {
      expect(src).toContain('import { stripAutoFields } from "./utils"');
    });

    it("updateServiceTemplate uses stripAutoFields", () => {
      const methodStart = src.indexOf("async updateServiceTemplate(");
      const methodEnd = src.indexOf("async deleteServiceTemplate(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });
  });

  describe("users.ts", () => {
    const src = readStorageFile("users.ts");

    it("imports stripAutoFields", () => {
      expect(src).toContain('import { stripAutoFields } from "./utils"');
    });

    it("updateUserProfile uses stripAutoFields", () => {
      const methodStart = src.indexOf("async updateUserProfile(");
      const methodEnd = src.indexOf("async updateUserSelectedTheme(");
      const body = src.slice(methodStart, methodEnd);
      expect(body).toContain("stripAutoFields(");
    });
  });
});

describe("Storage Layer — no .set() with raw spread bypassing stripAutoFields", () => {
  const files = ["properties.ts", "admin.ts", "services.ts", "users.ts"];

  for (const file of files) {
    it(`${file}: every .set({ ...data or .set(data) uses stripAutoFields`, () => {
      const src = readStorageFile(file);
      const lines = src.split("\n");
      const unsafeLines: string[] = [];
      for (const line of lines) {
        if (/\.set\(/.test(line) && !/stripAutoFields/.test(line)) {
          if (/\.set\(\{\s*\.\.\./.test(line) || /\.set\(data\)/.test(line)) {
            unsafeLines.push(line.trim());
          }
        }
      }

      expect(
        unsafeLines.length,
        `${file} has unsafe .set() calls: ${unsafeLines.join("; ")}`
      ).toBe(0);
    });
  }

  it("financial.ts: spread-based .set() calls use stripAutoFields or pre-stripped destructure", () => {
    const src = readStorageFile("financial.ts");
    const lines = src.split("\n");
    const unsafeLines: string[] = [];
    for (const line of lines) {
      if (/\.set\(/.test(line) && !/stripAutoFields/.test(line)) {
        if (/\.set\(\{\s*\.\.\./.test(line)) {
          if (!/\.\.\.gaData/.test(line) && !/\.\.\.propData/.test(line) && !/\.\.\.patch/.test(line) && !/\.\.\.catData/.test(line)) {
            unsafeLines.push(line.trim());
          }
        }
        if (/\.set\(data\)/.test(line)) {
          unsafeLines.push(line.trim());
        }
      }
    }
    expect(
      unsafeLines.length,
      `financial.ts has unsafe .set() calls: ${unsafeLines.join("; ")}`
    ).toBe(0);
  });
});

describe("Storage Layer — Save routes use allowlisted fields or Zod validation", () => {
  const routesDir = path.resolve(__dirname, "../../server/routes");

  function readRouteFile(...parts: string[]): string {
    return fs.readFileSync(path.join(routesDir, ...parts), "utf-8");
  }

  it("properties PATCH route validates with Zod schema", () => {
    const src = readRouteFile("properties.ts");
    expect(src).toContain("updatePropertySchema.safeParse(req.body)");
  });

  it("scenarios PATCH route validates with Zod schema", () => {
    const src = readRouteFile("scenarios.ts");
    expect(src).toContain("updateScenarioSchema.safeParse(req.body)");
  });

  it("global-assumptions PUT route validates with Zod schema", () => {
    const src = readRouteFile("global-assumptions.ts");
    expect(src).toContain("insertGlobalAssumptionsSchema.safeParse(merged)");
  });

  it("service templates PATCH route validates with Zod schema", () => {
    const src = readRouteFile("admin", "services.ts");
    expect(src).toContain("updateServiceTemplateSchema.safeParse(req.body)");
  });
});
