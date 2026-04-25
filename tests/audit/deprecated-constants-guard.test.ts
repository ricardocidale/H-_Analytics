import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function read(p: string): string {
  return readFileSync(resolve(p), "utf-8");
}

describe("Deprecated-constants guard — Task #407", () => {
  const guardPath = "script/check-deprecated-constants.ts";

  it("the guard script exists and enumerates all four @deprecated symbols", () => {
    // Task #403 deleted DEFAULT_COMPANY_TAX_RATE and Audit #406 / Task #405
    // deleted DEFAULT_COST_RATE_TAXES outright (the latter was divergent
    // from the registry baseline). They are intentionally NOT in this list —
    // the TypeScript compile error from importing a non-existent export is
    // the canonical signal now, not the lint guard.
    const guard = read(guardPath);
    for (const sym of [
      "DEPRECIATION_YEARS",
      "DAYS_PER_MONTH",
      "DEFAULT_PROPERTY_INFLATION_RATE",
      "DEFAULT_COMPANY_INFLATION_RATE",
    ]) {
      expect(guard).toContain(sym);
    }
    expect(guard).toMatch(/process\.exit\(/);
  });

  it("DEFAULT_COMPANY_TAX_RATE is no longer a tracked symbol (Task #403 decision)", () => {
    // Task #403 formally recorded the decision to NOT introduce a separate
    // `companyTaxRate` registry key. The legacy symbol was deleted in Audit
    // #406, so the deprecation guard's symbol *list* should no longer name
    // it (the file *header* still mentions it for historical context, which
    // is allowed).
    const constants = read("shared/constants.ts");
    expect(constants).not.toMatch(/export\s+const\s+DEFAULT_COMPANY_TAX_RATE\b/);

    const guard = read(guardPath);
    // The DEPRECATED_SYMBOLS array literal must not contain the symbol.
    const arrayMatch = guard.match(/const\s+DEPRECATED_SYMBOLS\s*=\s*\[([\s\S]*?)\];/);
    expect(arrayMatch, "DEPRECATED_SYMBOLS array not found in guard script").not.toBeNull();
    expect(arrayMatch![1]).not.toContain("DEFAULT_COMPANY_TAX_RATE");
  });

  it("the guard's allow-list matches every symbol still listed @deprecated in shared/constants.ts", () => {
    // If a future task removes a deprecation, this test surfaces the drift
    // so the guard's symbol list is updated in the same commit.
    const constants = read("shared/constants.ts");
    const stillDeprecated: string[] = [];
    const re = /@deprecated[\s\S]*?export\s+const\s+([A-Z_][A-Z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(constants)) !== null) {
      stillDeprecated.push(m[1]);
    }
    const guard = read(guardPath);
    for (const sym of stillDeprecated) {
      expect(
        guard,
        `${sym} is @deprecated in shared/constants.ts but missing from the guard's symbol list`,
      ).toContain(sym);
    }
  });

  it("audit:quick wires the guard as a critical finding", () => {
    const src = read("script/audit-quick.ts");
    expect(src).toContain("script/check-deprecated-constants.ts");
    expect(src).toMatch(
      /Deprecated-constants guard[\s\S]{0,400}severity:\s*deprecatedConstGuardCount\s*>\s*0\s*\?\s*"critical"/,
    );
  });

  it("passes against the current codebase (allow-list is in sync)", () => {
    // execFileSync throws on non-zero exit. A clean run means every existing
    // import is allow-listed.
    expect(() =>
      execFileSync("npx", ["tsx", guardPath], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("fails when a non-allowlisted file imports a deprecated symbol", () => {
    const probe = "server/_deprecated_const_guard_probe.ts";
    // DEPRECIATION_YEARS is still @deprecated in shared/constants.ts
    // (Audit #319 R4). Previously this probe used DEFAULT_COST_RATE_TAXES,
    // but Audit #406 / Task #405 deleted that constant, so it's no longer
    // a valid import. Any of the four remaining @deprecated symbols works.
    writeFileSync(
      probe,
      `import { DEPRECIATION_YEARS } from "@shared/constants";\nexport const x = DEPRECIATION_YEARS;\n`,
    );
    try {
      let threw = false;
      let stdout = "";
      try {
        execFileSync("npx", ["tsx", guardPath], {
          encoding: "utf-8",
          timeout: 30_000,
          stdio: "pipe",
          env: { ...process.env, INCLUDE_GUARD_PROBE: "1" },
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
        stdout = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(threw, "guard should exit non-zero on a new violation").toBe(true);
      expect(stdout).toContain("getFactoryNumber");
      expect(stdout).toContain("_deprecated_const_guard_probe");
    } finally {
      if (existsSync(probe)) unlinkSync(probe);
    }
  });
});
