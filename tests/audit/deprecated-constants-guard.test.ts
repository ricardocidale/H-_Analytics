import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function read(p: string): string {
  return readFileSync(resolve(p), "utf-8");
}

describe("Deprecated-constants guard — Task #407", () => {
  const guardPath = "script/check-deprecated-constants.ts";

  it("the guard script exists and enumerates all six @deprecated symbols", () => {
    const guard = read(guardPath);
    for (const sym of [
      "DEPRECIATION_YEARS",
      "DAYS_PER_MONTH",
      "DEFAULT_PROPERTY_INFLATION_RATE",
      "DEFAULT_COMPANY_INFLATION_RATE",
      "DEFAULT_COMPANY_TAX_RATE",
      "DEFAULT_COST_RATE_TAXES",
    ]) {
      expect(guard).toContain(sym);
    }
    expect(guard).toMatch(/process\.exit\(/);
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
    writeFileSync(
      probe,
      `import { DEFAULT_COST_RATE_TAXES } from "@shared/constants";\nexport const x = DEFAULT_COST_RATE_TAXES;\n`,
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
