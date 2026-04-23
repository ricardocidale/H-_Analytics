import { describe, it, expect } from "vitest";
import {
  FinancialSharingStorage,
  FINANCIAL_SHARING_DOMAIN_FACTORIES,
} from "../../server/storage/financial-sharing";

/**
 * FinancialSharingStorage Orchestrator — submodule registration audit.
 *
 * Mirrors the intelligence-v2 orchestrator audit. The class composes its
 * submodules by walking each prototype in its constructor and binding every
 * public method onto itself. If a future submodule is added but not
 * registered, or a method moves between submodules incorrectly, the failure
 * would only surface at runtime when a route calls the missing method.
 *
 * Both this test and the constructor iterate the same exported registry
 * (`FINANCIAL_SHARING_DOMAIN_FACTORIES`).
 */

function publicMethodNames(instance: object): string[] {
  const seen = new Set<string>();
  const sources: Array<Record<string, unknown>> = [
    instance as Record<string, unknown>,
    Object.getPrototypeOf(instance) as Record<string, unknown>,
  ];
  const names: string[] = [];
  for (const src of sources) {
    for (const name of Object.getOwnPropertyNames(src)) {
      if (name === "constructor" || seen.has(name)) continue;
      const value = src[name];
      if (typeof value !== "function") continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

describe("FinancialSharingStorage orchestrator — every submodule method is wired", () => {
  const orchestrator = new FinancialSharingStorage();
  const orchestratorRecord = orchestrator as unknown as Record<string, unknown>;

  const submodules = FINANCIAL_SHARING_DOMAIN_FACTORIES.map((factory) => {
    const instance = factory();
    return {
      name: instance.constructor.name,
      methods: publicMethodNames(instance),
    };
  });

  it("registry exposes at least one submodule", () => {
    expect(submodules.length).toBeGreaterThan(0);
  });

  for (const { name, methods } of submodules) {
    it(`${name} exposes at least one public method`, () => {
      expect(methods.length).toBeGreaterThan(0);
    });

    for (const method of methods) {
      it(`${name}.${method} is present and callable on FinancialSharingStorage`, () => {
        const value = orchestratorRecord[method];
        expect(
          typeof value,
          `Expected FinancialSharingStorage.${method} (from ${name}) to be a function. ` +
            `If you added a new submodule, register it in FINANCIAL_SHARING_DOMAIN_FACTORIES ` +
            `in server/storage/financial-sharing.ts.`,
        ).toBe("function");
      });
    }
  }

  it("orchestrator exposes the sum of all submodule methods (catches accidental over- or under-wiring)", () => {
    const expected = new Set(submodules.flatMap((d) => d.methods));
    const wired = Object.getOwnPropertyNames(orchestrator).filter(
      (name) => typeof orchestratorRecord[name] === "function",
    );
    const wiredSet = new Set(wired);

    const missing = [...expected].filter((m) => !wiredSet.has(m));
    expect(missing, `Missing methods on orchestrator: ${missing.join(", ")}`).toEqual([]);
    expect(wired.length).toBe(expected.size);
  });
});
