import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Build a unique temp dir for probe files. Probes MUST live outside the
 * TypeScript project — otherwise even after we delete them, the next
 * `tsc --build` reads them from `.tsbuildinfo` and errors with TS6053.
 * The script is pointed at this dir via MAGIC_NUMBERS_SCAN_DIRS_OVERRIDE.
 */
function makeProbeDir(label: string): string {
  const dir = join(
    tmpdir(),
    `magic-numbers-probe-${label}-${process.pid}-${Date.now()}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Best-effort recursive removal of a probe dir.
 */
function rmProbeDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Historical safety net: an earlier version of this suite wrote probes
 * directly under `calc/`. Wipe any such leftover so older check-outs are
 * self-healing on first run. New probes never go there.
 */
function wipeLegacyLeftoverProbes(): void {
  const calcDir = resolve("calc");
  if (!existsSync(calcDir)) return;
  for (const entry of readdirSync(calcDir)) {
    if (entry.startsWith("_magic_numbers_") && entry.endsWith(".ts")) {
      try {
        unlinkSync(join(calcDir, entry));
      } catch {
        /* best-effort */
      }
    }
  }
}

/**
 * Cross-file magic-number ratchet — paired with `script/check-magic-numbers.ts`
 * and the `no-magic-numbers` skill (.agents/skills/no-magic-numbers/SKILL.md).
 *
 * The cross-file duplication detector is the runtime gate for the skill's
 * "worst failure mode" — the same numeric literal appearing in multiple files,
 * silently drifting when one is updated and the others aren't. ESLint catches
 * per-file literals; this test catches the cross-file ones.
 *
 * The detector ratchets against `tests/audit/_magic-numbers-baseline.json`.
 * Any new occurrence of a known duplicated value, or any brand-new value
 * crossing the duplication threshold, fails this test.
 */

function read(p: string): string {
  return readFileSync(resolve(p), "utf-8");
}

/**
 * Wrapper around execFileSync that retries on EAGAIN. This test spawns
 * `npx tsx` repeatedly, and when many CI workflows restart at once the
 * Linux process table can transiently refuse a fork (`EAGAIN: resource
 * temporarily unavailable`). That is environmental, not a code defect,
 * and a short backoff resolves it. We DO NOT swallow other errors.
 */
function runGuard(
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return execFileSync("npx", args as string[], options);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isEagain = msg.includes("EAGAIN");
      if (!isEagain || attempt === maxAttempts) throw err;
      lastErr = err;
      // exponential backoff: 200ms, 400ms, 800ms — total ≤ 1.4s
      const sleepMs = 200 * Math.pow(2, attempt - 1);
      const start = Date.now();
      while (Date.now() - start < sleepMs) {
        // busy-wait — sync test context, no event loop
      }
    }
  }
  throw lastErr;
}

const GUARD = "script/check-magic-numbers.ts";
const BASELINE = "tests/audit/_magic-numbers-baseline.json";

describe("Magic-numbers cross-file duplication ratchet", () => {
  // One-time cleanup of any pre-existing legacy probes from older
  // versions of this test file. New probes go to OS temp dirs and never
  // touch `calc/`.
  beforeAll(wipeLegacyLeftoverProbes);
  afterAll(wipeLegacyLeftoverProbes);

  it("the guard script exists with the four-category contract from SKILL.md", () => {
    const src = read(GUARD);
    expect(src).toContain("DUPLICATION_THRESHOLD");
    expect(src).toContain("ALLOWED_DUPLICATED_VALUES");
    expect(src).toContain("BASELINE_FILE");
    // The script must reference the SKILL so a future maintainer can find it.
    expect(src).toMatch(/no-magic-numbers/);
    expect(src).toMatch(/process\.exit\(/);
  });

  it("the allowlist does not contain ambiguous policy/jurisdictional values", () => {
    // Architect-flagged regression lock. The allowlist is value-only —
    // any vague entry trivially exempts unrelated jurisdictional values
    // that share that literal. We forbid:
    //   - "10": too vague (display cap? threshold? policy?)
    //   - "30": 30/360 short-month day-count convention (US bonds /
    //     European mortgages — instrument-specific, not universal).
    // If a future maintainer tries to silence a real cross-file
    // duplication by adding either back, this test fails.
    const src = read(GUARD);
    // Match the EXACT JSON-key form on a line by itself in the allowlist
    // table — avoids matching bare 10/30 inside comments or other strings.
    expect(src).not.toMatch(/^\s*"10":\s/m);
    expect(src).not.toMatch(/^\s*"30":\s/m);
  });

  it("a baseline snapshot is checked in", () => {
    expect(existsSync(resolve(BASELINE))).toBe(true);
    const parsed = JSON.parse(read(BASELINE));
    expect(parsed).toHaveProperty("threshold");
    expect(parsed).toHaveProperty("duplications");
    expect(typeof parsed.duplications).toBe("object");
  });

  it("audit:quick wires the guard as a tracked finding", () => {
    const src = read("script/audit-quick.ts");
    expect(src).toContain("script/check-magic-numbers.ts");
    expect(src).toMatch(/Magic[- ]numbers?/i);
  });

  it("the 'audit:quick' npm script references the magic-numbers check", () => {
    const src = read("script/audit-quick.ts");
    expect(src).toContain("check-magic-numbers.ts");
  });

  it("the SKILL.md references the actual enforcement command", () => {
    const src = read(".agents/skills/no-magic-numbers/SKILL.md");
    expect(src).toContain("script/check-magic-numbers.ts");
    expect(src).toMatch(/Enforcement/);
  });

  it("passes against the current codebase (no regressions vs baseline)", () => {
    // execFileSync throws on non-zero exit — this asserts the ratchet is clean.
    expect(() =>
      runGuard(["tsx", GUARD], {
        encoding: "utf-8",
        timeout: 60_000,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("rejects a baseline whose threshold no longer matches the detector", () => {
    // If someone changes DUPLICATION_THRESHOLD without re-snapshotting,
    // every comparison silently becomes meaningless. The guard must
    // hard-fail with an actionable message. We use the script's
    // MAGIC_NUMBERS_BASELINE_OVERRIDE env-var so we never mutate the real
    // baseline file (which would race with the Magic Numbers Check
    // workflow / audit:quick running in parallel).
    const PROBE = "tests/audit/_probe-baseline-mismatch.json";
    writeFileSync(
      resolve(PROBE),
      JSON.stringify({
        generatedAt: "x",
        threshold: 999,
        duplications: {},
      }),
    );
    try {
      let combined = "";
      let threw = false;
      try {
        runGuard(["tsx", GUARD], {
          encoding: "utf-8",
          timeout: 60_000,
          stdio: "pipe",
          env: {
            ...process.env,
            MAGIC_NUMBERS_ALLOW_OVERRIDES: "1",
            MAGIC_NUMBERS_BASELINE_OVERRIDE: PROBE,
          },
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
        combined = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(threw, "guard must fail on threshold mismatch").toBe(true);
      expect(combined).toMatch(/threshold mismatch/i);
    } finally {
      const abs = resolve(PROBE);
      if (existsSync(abs)) unlinkSync(abs);
    }
  });

  it("fails on a file-swap that keeps the count constant (set comparison)", () => {
    // Architect-flagged false-pass: if a baseline value disappears from one
    // file but appears in a brand-new file, the count is unchanged but a
    // brand-new file picked up the literal — that IS a regression.
    // We exercise this by planting the literal in a NEW file that is not
    // present in the baseline for that value. The baseline cannot have
    // listed our probe file because the probe file does not exist at
    // baseline time, so any baseline value re-used here counts as a
    // file-set regression even though we add only one new file.
    const baseline = JSON.parse(read(BASELINE)) as {
      duplications: Record<string, string[]>;
    };
    // Pick any value whose baseline files exist and that we can re-use.
    const knownValue = Object.keys(baseline.duplications)[0];
    expect(knownValue, "baseline must have at least one known value").toBeTruthy();
    // For the file-swap test we need the baseline's KNOWN files to still
    // be present (otherwise everything looks like a regression), so we
    // include the real scan dirs AND a temp dir holding the new probe.
    const probeDir = makeProbeDir("swap");
    try {
      writeFileSync(
        join(probeDir, "swap_probe.ts"),
        `export const probe = ${knownValue} + 1;\n`,
      );
      let threw = false;
      let combined = "";
      try {
        runGuard(["tsx", GUARD], {
          encoding: "utf-8",
          timeout: 60_000,
          stdio: "pipe",
          env: {
            ...process.env,
            MAGIC_NUMBERS_ALLOW_OVERRIDES: "1",
            MAGIC_NUMBERS_SCAN_DIRS_OVERRIDE: `calc,engine,server,shared,${probeDir}`,
          },
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
        combined = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(
        threw,
        "guard must reject a known value appearing in a NEW file even at the same count",
      ).toBe(true);
      expect(combined).toMatch(/regressions|MORE files|new:/i);
    } finally {
      rmProbeDir(probeDir);
    }
  });

  it("extracts scientific-notation literals (1e3, 2.5E-6)", () => {
    // Extractor blind spot per architect review. Plant a brand-new
    // scientific-notation literal in 4 files; the guard must catch it.
    const probeDir = makeProbeDir("sci");
    const overrideEnv = {
      ...process.env,
      MAGIC_NUMBERS_ALLOW_OVERRIDES: "1",
      MAGIC_NUMBERS_SCAN_DIRS_OVERRIDE: probeDir,
    };
    try {
      for (const i of [1, 2, 3, 4]) {
        writeFileSync(
          join(probeDir, `sci_${i}.ts`),
          `export const x = 7.7e9;\n`,
        );
      }
      const out = runGuard(["tsx", GUARD, "--show"], {
        encoding: "utf-8",
        timeout: 60_000,
        stdio: "pipe",
        env: overrideEnv,
      });
      // Canonicalized: 7.7e9 → 7700000000
      expect(out).toMatch(/7700000000/);
      // And the ratchet must reject it as brand-new.
      let threw = false;
      let combined = "";
      try {
        runGuard(["tsx", GUARD], {
          encoding: "utf-8",
          timeout: 60_000,
          stdio: "pipe",
          env: overrideEnv,
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
        combined = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(threw, "scientific-notation duplication must be rejected").toBe(true);
      expect(combined).toMatch(/7700000000|brand-new/);
    } finally {
      rmProbeDir(probeDir);
    }
  });

  it("extracts leading-decimal literals (.5, .333)", () => {
    const probeDir = makeProbeDir("dec");
    try {
      for (const i of [1, 2, 3, 4]) {
        // .333 (not 0.333) — leading-decimal form. Canonicalized to "0.333".
        writeFileSync(join(probeDir, `dec_${i}.ts`), `export const x = .333;\n`);
      }
      let threw = false;
      let combined = "";
      try {
        runGuard(["tsx", GUARD], {
          encoding: "utf-8",
          timeout: 60_000,
          stdio: "pipe",
          env: {
            ...process.env,
            MAGIC_NUMBERS_ALLOW_OVERRIDES: "1",
            MAGIC_NUMBERS_SCAN_DIRS_OVERRIDE: probeDir,
          },
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
        combined = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(threw, "leading-decimal duplication must be rejected").toBe(true);
      expect(combined).toMatch(/0\.333|brand-new/);
    } finally {
      rmProbeDir(probeDir);
    }
  });

  it("fails when a brand-new value crosses the duplication threshold", () => {
    // Plant the SAME novel literal in 4 distinct probe files in a temp
    // dir, point the script at it, and assert the guard rejects it.
    // 73.0001 is chosen so it cannot collide with anything real.
    const probeDir = makeProbeDir("brandnew");
    const PROBE_VALUE = "73.0001";
    try {
      for (const i of [1, 2, 3, 4]) {
        writeFileSync(
          join(probeDir, `probe_${i}.ts`),
          `export const probe = ${PROBE_VALUE};\n`,
        );
      }
      let threw = false;
      let combined = "";
      try {
        runGuard(["tsx", GUARD], {
          encoding: "utf-8",
          timeout: 60_000,
          stdio: "pipe",
          env: {
            ...process.env,
            MAGIC_NUMBERS_ALLOW_OVERRIDES: "1",
            MAGIC_NUMBERS_SCAN_DIRS_OVERRIDE: probeDir,
          },
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
        combined = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(
        threw,
        "guard should exit non-zero when a new cross-file duplication appears",
      ).toBe(true);
      expect(combined).toContain(PROBE_VALUE);
      expect(combined).toMatch(/brand-new|regressions/i);
    } finally {
      rmProbeDir(probeDir);
    }
  });

  it.each([
    ["MAGIC_NUMBERS_SCAN_DIRS_OVERRIDE", tmpdir()],
    ["MAGIC_NUMBERS_BASELINE_OVERRIDE", join(tmpdir(), "nonexistent.json")],
  ])(
    "hard-fails when %s is set without MAGIC_NUMBERS_ALLOW_OVERRIDES",
    (overrideName, overrideValue) => {
      // Architect-flagged hardening: a contaminated workflow shell must
      // never silently weaken the ratchet by pointing it at a different
      // baseline or scan dir. EITHER override env-var without the allow
      // flag must exit non-zero, name itself in the error, AND tell the
      // operator about the allow flag.
      let threw = false;
      let combined = "";
      try {
        runGuard(["tsx", GUARD], {
          encoding: "utf-8",
          timeout: 60_000,
          stdio: "pipe",
          env: {
            ...process.env,
            // Note: NO MAGIC_NUMBERS_ALLOW_OVERRIDES.
            [overrideName]: overrideValue,
          },
        });
      } catch (err: unknown) {
        threw = true;
        const e = err as {
          stdout?: Buffer | string;
          stderr?: Buffer | string;
        };
        combined = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
      expect(threw, `guard must hard-fail on un-flagged ${overrideName}`).toBe(
        true,
      );
      expect(combined).toContain(overrideName);
      expect(combined).toContain("MAGIC_NUMBERS_ALLOW_OVERRIDES");
    },
  );
});
