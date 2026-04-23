import { describe, it, expect } from "vitest";
import {
  IntelligenceV2Storage,
  INTELLIGENCE_V2_DOMAIN_FACTORIES,
  ROOT_TX,
} from "../../server/storage/intelligence-v2";

/**
 * Intelligence V2 Orchestrator — domain registration audit.
 *
 * `IntelligenceV2Storage` composes its domain modules by walking each
 * prototype in its constructor and binding every public method onto itself.
 * If a future domain class is added but not registered, or a method is moved
 * between domains incorrectly, the failure would only surface at runtime when
 * a route calls the missing method.
 *
 * Both this test and the constructor iterate the same exported registry
 * (`INTELLIGENCE_V2_DOMAIN_FACTORIES`), so adding a domain there
 * automatically extends the runtime composition AND this gate-time audit —
 * there is no second place to update.
 */

function publicMethodNames(instance: object): string[] {
  const proto = Object.getPrototypeOf(instance) as object;
  return Object.getOwnPropertyNames(proto).filter((name) => {
    if (name === "constructor") return false;
    const value = (proto as Record<string, unknown>)[name];
    return typeof value === "function";
  });
}

describe("IntelligenceV2Storage orchestrator — every domain method is wired", () => {
  const orchestrator = new IntelligenceV2Storage();
  const orchestratorRecord = orchestrator as unknown as Record<string, unknown>;

  const domains = INTELLIGENCE_V2_DOMAIN_FACTORIES.map((factory) => {
    const instance = factory(ROOT_TX);
    return {
      name: instance.constructor.name,
      methods: publicMethodNames(instance),
    };
  });

  it("registry exposes at least one domain", () => {
    expect(domains.length).toBeGreaterThan(0);
  });

  for (const { name, methods } of domains) {
    it(`${name} exposes at least one public method`, () => {
      expect(methods.length).toBeGreaterThan(0);
    });

    for (const method of methods) {
      it(`${name}.${method} is present and callable on IntelligenceV2Storage`, () => {
        const value = orchestratorRecord[method];
        expect(
          typeof value,
          `Expected IntelligenceV2Storage.${method} (from ${name}) to be a function. ` +
            `If you added a new domain module, register it in INTELLIGENCE_V2_DOMAIN_FACTORIES ` +
            `in server/storage/intelligence-v2.ts.`,
        ).toBe("function");
      });
    }
  }

  it("orchestrator exposes the sum of all domain methods (catches accidental over- or under-wiring)", () => {
    const expected = new Set(domains.flatMap((d) => d.methods));
    const wired = Object.getOwnPropertyNames(orchestrator).filter(
      (name) => typeof orchestratorRecord[name] === "function",
    );
    const wiredSet = new Set(wired);

    const missing = [...expected].filter((m) => !wiredSet.has(m));
    expect(missing, `Missing methods on orchestrator: ${missing.join(", ")}`).toEqual([]);
    expect(wired.length).toBe(expected.size);
  });
});
