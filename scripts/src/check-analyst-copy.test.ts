/**
 * Tests for check-analyst-copy.ts
 *
 * Verifies that:
 *   1. The script file exists and is invokable.
 *   2. The script passes against the committed codebase (no banned phrases).
 *   3. Synthetic violations in string literals, JSX text, and template literals
 *      are detected.
 *   4. The same phrase living inside a // line comment or a /* block comment
 *      is NOT flagged.
 *   5. Sentences without the "The" prefix (e.g. aria-label="Analyst is running")
 *      are NOT flagged.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(__dirname, "check-analyst-copy.ts");
const SCAN_DIR = path.join(
  WORKSPACE_ROOT,
  "artifacts/hospitality-business-portal/src",
);
// Task #1467: backend coverage. Fixtures dropped here exercise the api-server
// scan branch (toasts, transactional emails, websocket status messages,
// OpenAPI error descriptions) and the per-line `req.log.*` skip predicate.
const API_SCAN_DIR = path.join(WORKSPACE_ROOT, "artifacts/api-server/src");

function runCheck(): { stdout: string; stderr: string; status: number } {
  // Disable the input-hash cache so synthetic fixtures are always re-evaluated.
  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/scripts", "exec", "tsx", "src/check-analyst-copy.ts"],
    {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
      env: { ...process.env, CHECK_CACHE_DISABLED: "1" },
    },
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

function withFixture(name: string, contents: string, body: () => void): void {
  const tmpFile = path.join(SCAN_DIR, name);
  try {
    fs.writeFileSync(tmpFile, contents, "utf8");
    body();
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // best-effort
    }
  }
}

function withApiFixture(
  name: string,
  contents: string,
  body: () => void,
): void {
  const tmpFile = path.join(API_SCAN_DIR, name);
  try {
    fs.writeFileSync(tmpFile, contents, "utf8");
    body();
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // best-effort
    }
  }
}

// Each test spawns `tsx` and walks the H+ portal source tree, which routinely
// exceeds Vitest's default 5s per-test budget on cold runs. Give every test in
// this file a generous timeout so the suite is never flaky for timing reasons.
const TEST_TIMEOUT_MS = 60_000;

describe("check-analyst-copy", { timeout: TEST_TIMEOUT_MS }, () => {
  it("script file exists", () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it("passes on the committed codebase", () => {
    const { stdout, stderr, status } = runCheck();
    if (status !== 0) {
      console.error("check:analyst-copy found violations:\n" + stderr);
    }
    expect(status).toBe(0);
    expect(stdout).toContain("PASS");
  });

  it("catches the banned phrase in a JSX text node", () => {
    withFixture(
      "_analyst-copy-test-jsx-fixture.tsx",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "export function Fixture() {",
        "  return <p>The Analyst is studying your property</p>;",
        "}",
      ].join("\n"),
      () => {
        const { stderr, status } = runCheck();
        expect(status).toBe(1);
        expect(stderr).toContain("VIOLATION");
        expect(stderr).toContain("_analyst-copy-test-jsx-fixture.tsx");
      },
    );
  });

  it("catches the banned phrase in a double-quoted string literal", () => {
    withFixture(
      "_analyst-copy-test-string-fixture.tsx",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "export const TITLE = \"The Analyst is computing rates\";",
      ].join("\n"),
      () => {
        const { stderr, status } = runCheck();
        expect(status).toBe(1);
        expect(stderr).toContain("VIOLATION");
        expect(stderr).toContain("_analyst-copy-test-string-fixture.tsx");
      },
    );
  });

  it("catches the banned phrase in a template literal", () => {
    withFixture(
      "_analyst-copy-test-template-fixture.tsx",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "const target = \"comps\";",
        "export const MSG = `The Analyst is researching ${target}`;",
      ].join("\n"),
      () => {
        const { stderr, status } = runCheck();
        expect(status).toBe(1);
        expect(stderr).toContain("VIOLATION");
        expect(stderr).toContain("_analyst-copy-test-template-fixture.tsx");
      },
    );
  });

  it("does NOT flag the phrase inside a // line comment", () => {
    withFixture(
      "_analyst-copy-test-line-comment-fixture.tsx",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "// Historical note: The Analyst is studying was the old copy.",
        "export const X = 1;",
      ].join("\n"),
      () => {
        const { stdout, status } = runCheck();
        expect(status).toBe(0);
        expect(stdout).toContain("PASS");
      },
    );
  });

  it("does NOT flag the phrase inside a /* block comment */", () => {
    withFixture(
      "_analyst-copy-test-block-comment-fixture.tsx",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "/**",
        " * The Analyst is doing research while this UI is mounted.",
        " * (Historical doc string — superseded by casual copy.)",
        " */",
        "export const X = 1;",
      ].join("\n"),
      () => {
        const { stdout, status } = runCheck();
        expect(status).toBe(0);
        expect(stdout).toContain("PASS");
      },
    );
  });

  it("does NOT flag sentences missing the 'The' prefix", () => {
    // Mirrors the existing aria-label="Analyst is running" usage in the codebase.
    withFixture(
      "_analyst-copy-test-no-the-fixture.tsx",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "export function Fixture() {",
        "  return <span aria-label=\"Analyst is running\">…</span>;",
        "}",
      ].join("\n"),
      () => {
        const { stdout, status } = runCheck();
        expect(status).toBe(0);
        expect(stdout).toContain("PASS");
      },
    );
  });

  it("does NOT flag identifiers like TheAnalystIsRunning (no spaces)", () => {
    withFixture(
      "_analyst-copy-test-identifier-fixture.tsx",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "export const TheAnalystIsRunning = true;",
      ].join("\n"),
      () => {
        const { stdout, status } = runCheck();
        expect(status).toBe(0);
        expect(stdout).toContain("PASS");
      },
    );
  });

  // -------------------------------------------------------------------------
  // Task #1467 — backend coverage
  // -------------------------------------------------------------------------

  it("catches the banned phrase in a server-side toast/email payload", () => {
    withApiFixture(
      "_analyst-copy-test-server-toast-fixture.ts",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "export const REFRESH_TOAST = {",
        "  title: \"Heads up\",",
        "  body: \"The Analyst is refreshing your assumptions\",",
        "};",
      ].join("\n"),
      () => {
        const { stderr, status } = runCheck();
        expect(status).toBe(1);
        expect(stderr).toContain("VIOLATION");
        expect(stderr).toContain("_analyst-copy-test-server-toast-fixture.ts");
      },
    );
  });

  it("DOES flag a non-logging line that merely mentions the word 'log'", () => {
    // Regression guard for SKIP_LINE_PATTERNS: the skip is anchored to
    // logger/log/console METHOD calls (.info/.warn/.error/etc.) so a
    // user-visible string that happens to contain the word "log" must still
    // be flagged. Prevents the skip from becoming overly permissive.
    withApiFixture(
      "_analyst-copy-test-server-non-log-fixture.ts",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "export const AUDIT_LOG_HEADING = \"Audit log: The Analyst is refreshing rates\";",
      ].join("\n"),
      () => {
        const { stderr, status } = runCheck();
        expect(status).toBe(1);
        expect(stderr).toContain("VIOLATION");
        expect(stderr).toContain(
          "_analyst-copy-test-server-non-log-fixture.ts",
        );
      },
    );
  });

  it("does NOT flag req.log.* lines (backend-only logging is exempt)", () => {
    withApiFixture(
      "_analyst-copy-test-server-log-fixture.ts",
      [
        "// AUTO-GENERATED TEST FIXTURE — deleted after test",
        "export function trace(req: { log: { info: (msg: string) => void } }) {",
        "  req.log.info(\"The Analyst is starting a refresh cycle\");",
        "}",
      ].join("\n"),
      () => {
        const { stdout, status } = runCheck();
        expect(status).toBe(0);
        expect(stdout).toContain("PASS");
      },
    );
  });
});
