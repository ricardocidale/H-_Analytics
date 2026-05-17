/**
 * check-gate-health.ts
 *
 * Meta-checker: verifies that registered zero-tolerance gates are still
 * wired and effective. Prevents the "authoritative-doc contradicting dead
 * code" failure mode documented at
 * docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md
 * — i.e. CLAUDE.md §13 declares a gate, but somewhere along the way the
 * script is deleted, the CI step removed, or the `process.exit(1)` swallowed.
 *
 * For each registered gate, asserts:
 *   1. FILE-EXISTS — the checker script file exists and is non-empty.
 *   2. CI-WIRED    — the CI workflow file references the gate's pnpm script.
 *   3. EFFECTIVE   — invoking the checker against an embedded synthetic
 *                    violation fixture produces a non-zero exit code.
 *
 * To register a new gate, append an entry to GATES below. Initial registry:
 *   - check:ui-canonical (CLAUDE.md §13)
 *
 * The script exits 0 if all assertions pass for every registered gate, and
 * exits 1 (with a clear per-assertion explanation) if any fails.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const CI_WORKFLOW_PATH = path.join(WORKSPACE_ROOT, ".github/workflows/ci.yml");
const PORTAL_SRC = path.join(
  WORKSPACE_ROOT,
  "artifacts/hospitality-business-portal/src",
);

interface GateRegistration {
  /** pnpm script name (matches root package.json key and CI workflow ref). */
  pnpmScript: string;
  /** Absolute path to the checker .ts file. */
  scriptPath: string;
  /** Short label used in pass/fail messages. */
  label: string;
  /** A code snippet that the checker MUST flag as a violation. */
  syntheticViolation: string;
}

const GATES: GateRegistration[] = [
  {
    pnpmScript: "check:ui-canonical",
    scriptPath: path.join(__dirname, "check-ui-canonical.ts"),
    label: "UI canonical (Analyst CTA + horizontal tabs)",
    syntheticViolation:
      `export const X = () => <button>Ask The Analyst</button>;\n`,
  },
];

interface AssertionResult {
  gate: string;
  step: "FILE-EXISTS" | "CI-WIRED" | "EFFECTIVE";
  pass: boolean;
  detail: string;
}

function assertFileExists(g: GateRegistration): AssertionResult {
  const exists = fs.existsSync(g.scriptPath);
  const size = exists ? fs.statSync(g.scriptPath).size : 0;
  return {
    gate: g.pnpmScript,
    step: "FILE-EXISTS",
    pass: exists && size > 0,
    detail: exists
      ? `${path.relative(WORKSPACE_ROOT, g.scriptPath)} (${size} bytes)`
      : `MISSING: ${path.relative(WORKSPACE_ROOT, g.scriptPath)}`,
  };
}

function assertCiWired(g: GateRegistration): AssertionResult {
  if (!fs.existsSync(CI_WORKFLOW_PATH)) {
    return {
      gate: g.pnpmScript,
      step: "CI-WIRED",
      pass: false,
      detail: `CI workflow not found at ${path.relative(WORKSPACE_ROOT, CI_WORKFLOW_PATH)}`,
    };
  }
  const ci = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
  const wired = ci.includes(g.pnpmScript);
  return {
    gate: g.pnpmScript,
    step: "CI-WIRED",
    pass: wired,
    detail: wired
      ? `referenced in ${path.relative(WORKSPACE_ROOT, CI_WORKFLOW_PATH)}`
      : `NOT referenced in ${path.relative(WORKSPACE_ROOT, CI_WORKFLOW_PATH)}`,
  };
}

function assertEffective(g: GateRegistration): AssertionResult {
  // Drop a synthetic-violation fixture into the portal src tree, run the
  // checker, capture exit code, then remove. Sandbox uses a uniquely-named
  // file so a crash doesn't leave a stale fixture behind on subsequent runs.
  const fixtureName = `__gate_health_fixture_${process.pid}_${Date.now()}.tsx`;
  const fixturePath = path.join(PORTAL_SRC, fixtureName);
  let status: number | null = null;
  try {
    fs.writeFileSync(fixturePath, g.syntheticViolation, "utf8");
    const r = spawnSync(
      "pnpm",
      ["--filter", "@workspace/scripts", "exec", "tsx", `src/${path.basename(g.scriptPath)}`],
      {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        env: { ...process.env, CHECK_CACHE_DISABLED: "1" },
      },
    );
    status = r.status;
  } finally {
    try {
      fs.unlinkSync(fixturePath);
    } catch {
      // best-effort
    }
  }
  return {
    gate: g.pnpmScript,
    step: "EFFECTIVE",
    pass: status === 1,
    detail:
      status === 1
        ? "synthetic violation produced exit code 1 as expected"
        : `synthetic violation produced exit code ${status} — checker is not blocking`,
  };
}

function runAssertions(gate: GateRegistration): AssertionResult[] {
  return [
    assertFileExists(gate),
    assertCiWired(gate),
    assertEffective(gate),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failures = 0;
  const results: AssertionResult[] = [];

  for (const gate of GATES) {
    for (const r of runAssertions(gate)) {
      results.push(r);
      if (!r.pass) failures++;
    }
  }

  for (const r of results) {
    const tag = r.pass ? "ok  " : "FAIL";
    console[r.pass ? "log" : "error"](
      `${tag}  ${r.gate}  ${r.step}  ${r.detail}`,
    );
  }
  console.error(""); // spacer — works on both PASS and FAIL paths

  if (failures === 0) {
    console.log(
      `check:gate-health  PASS — ${GATES.length} gate(s) wired and effective`,
    );
    process.exit(0);
  } else {
    console.error(
      `check:gate-health  FAIL — ${failures} assertion(s) failed across ${GATES.length} gate(s)`,
    );
    console.error("");
    console.error("Each registered zero-tolerance gate must pass three assertions:");
    console.error("  1. FILE-EXISTS  — checker script is present and non-empty.");
    console.error("  2. CI-WIRED     — CI workflow file references the pnpm script.");
    console.error("  3. EFFECTIVE    — a known synthetic violation is detected (exit 1).");
    console.error("");
    console.error(
      "If a gate has been intentionally removed, also remove its entry from",
    );
    console.error("the GATES registry in scripts/src/check-gate-health.ts.");
    process.exit(1);
  }
}
