import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(__dirname, "check-magic-numbers.ts");
const BASELINE = path.join(__dirname, "_magic-numbers-baseline.json");

function runRatchet(args: string[] = []): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/scripts", "exec", "tsx", "src/check-magic-numbers.ts", ...args],
    { cwd: WORKSPACE_ROOT, encoding: "utf8" }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

describe("check-magic-numbers", () => {
  it("script exists", () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it("baseline exists and is valid JSON", () => {
    expect(fs.existsSync(BASELINE)).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(BASELINE, "utf8"))).not.toThrow();
  });

  it("baseline is an object with string-array values", () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    expect(typeof baseline).toBe("object");
    for (const [key, value] of Object.entries(baseline)) {
      expect(typeof key).toBe("string");
      expect(Array.isArray(value)).toBe(true);
      for (const f of value as string[]) {
        expect(typeof f).toBe("string");
      }
    }
  });

  it("ratchet passes on the committed codebase", () => {
    const { stdout, status } = runRatchet();
    expect(status).toBe(0);
    expect(stdout).toContain("PASS");
  });

  it("--show mode exits 0 and reports suspects or clean state", () => {
    const { stdout, status } = runRatchet(["--show"]);
    expect(status).toBe(0);
    const hasExpected =
      stdout.includes("suspects") || stdout.includes("No cross-file");
    expect(hasExpected).toBe(true);
  });
});
