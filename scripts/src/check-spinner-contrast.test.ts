/**
 * Tests for check-spinner-contrast.ts
 *
 * Verifies that:
 *   1. The script file exists and is valid TypeScript (importable).
 *   2. The script passes (exits 0) against the committed codebase — meaning
 *      no Loader2 spinners with `text-accent-pop` live inside a dark-fill
 *      Button (variant="default" or variant="destructive").
 *   3. The script fails (exits 1) when a synthetic violation is injected into
 *      a temp file — ensuring the detection logic is actually exercised.
 *
 * CANONICAL FIX REMINDER
 * ----------------------
 * If this test fails on the committed codebase, fix the violating file(s) by
 * replacing `text-accent-pop` with `text-white` on the Loader2:
 *
 *   Before:
 *     <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
 *
 *   After:
 *     {/* Spinner on bg-primary (sage); text-white keeps WCAG 3:1 contrast. *\/}
 *     <Loader2 className="w-4 h-4 animate-spin text-white" />
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(__dirname, "check-spinner-contrast.ts");

function runCheck(extraArgs: string[] = []): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/scripts", "exec", "tsx", "src/check-spinner-contrast.ts", ...extraArgs],
    { cwd: WORKSPACE_ROOT, encoding: "utf8" }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

describe("check-spinner-contrast", () => {
  it("script file exists", () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it("passes on the committed codebase (no dark-button text-accent-pop spinners)", () => {
    const { stdout, stderr, status } = runCheck();
    if (status !== 0) {
      // Surface the violations so the developer sees them in the test output.
      console.error("check:spinner-contrast found violations:\n" + stderr);
    }
    expect(status).toBe(0);
    expect(stdout).toContain("PASS");
  });

  it("catches a synthetic Form A violation (variant on same line as <Button)", () => {
    // Write a minimal TSX file that has the bad pattern and place it
    // temporarily inside the scanned directory, then run the checker.
    const srcDir = path.join(
      WORKSPACE_ROOT,
      "artifacts/hospitality-business-portal/src"
    );
    const tmpFile = path.join(srcDir, "_spinner-contrast-test-fixture.tsx");
    const badJsx = [
      "// AUTO-GENERATED TEST FIXTURE — deleted after test",
      'import { Loader2 } from "@/components/icons/themed-icons";',
      "export function Fixture() {",
      '  return <Button variant="default"><Loader2 className="animate-spin text-accent-pop" /></Button>;',
      "}",
    ].join("\n");

    try {
      fs.writeFileSync(tmpFile, badJsx, "utf8");
      const { stderr, status } = runCheck();
      expect(status).toBe(1);
      expect(stderr).toContain("VIOLATION");
      expect(stderr).toContain("_spinner-contrast-test-fixture.tsx");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("catches a synthetic Form B violation (variant on its own line)", () => {
    const srcDir = path.join(
      WORKSPACE_ROOT,
      "artifacts/hospitality-business-portal/src"
    );
    const tmpFile = path.join(srcDir, "_spinner-contrast-test-fixture-b.tsx");
    const badJsx = [
      "// AUTO-GENERATED TEST FIXTURE — deleted after test",
      'import { Loader2 } from "@/components/icons/themed-icons";',
      "export function Fixture() {",
      "  return (",
      "    <Button",
      '      variant="destructive"',
      "      onClick={() => {}}",
      "    >",
      '      <Loader2 className="animate-spin text-accent-pop" />',
      "    </Button>",
      "  );",
      "}",
    ].join("\n");

    try {
      fs.writeFileSync(tmpFile, badJsx, "utf8");
      const { stderr, status } = runCheck();
      expect(status).toBe(1);
      expect(stderr).toContain("VIOLATION");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("does NOT flag text-accent-pop spinners outside of dark buttons", () => {
    // A Loader2 with text-accent-pop on a white/ghost button is fine and
    // should not be flagged.
    const srcDir = path.join(
      WORKSPACE_ROOT,
      "artifacts/hospitality-business-portal/src"
    );
    const tmpFile = path.join(srcDir, "_spinner-contrast-test-ok-fixture.tsx");
    const okJsx = [
      "// AUTO-GENERATED TEST FIXTURE — deleted after test",
      'import { Loader2 } from "@/components/icons/themed-icons";',
      "export function Fixture() {",
      "  return (",
      "    <>",
      '      <Button variant="ghost"><Loader2 className="animate-spin text-accent-pop" /></Button>',
      '      <Button variant="outline"><Loader2 className="animate-spin text-accent-pop" /></Button>',
      '      <div><Loader2 className="animate-spin text-accent-pop" /></div>',
      "    </>",
      "  );",
      "}",
    ].join("\n");

    try {
      fs.writeFileSync(tmpFile, okJsx, "utf8");
      const { stdout, status } = runCheck();
      expect(status).toBe(0);
      expect(stdout).toContain("PASS");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("catches a SaveButton violation (wrapping form with text-accent-pop spinner)", () => {
    const srcDir = path.join(
      WORKSPACE_ROOT,
      "artifacts/hospitality-business-portal/src"
    );
    const tmpFile = path.join(srcDir, "_spinner-contrast-test-savebtn-fixture.tsx");
    const badJsx = [
      "// AUTO-GENERATED TEST FIXTURE — deleted after test",
      'import { Loader2 } from "@/components/icons/themed-icons";',
      'import { SaveButton } from "@/components/ui/save-button";',
      "export function Fixture({ isPending }: { isPending: boolean }) {",
      "  return (",
      "    <SaveButton",
      '      onClick={() => {}}',
      "      hasChanges",
      "    >",
      '      {isPending && <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />}',
      "      Save",
      "    </SaveButton>",
      "  );",
      "}",
    ].join("\n");

    try {
      fs.writeFileSync(tmpFile, badJsx, "utf8");
      const { stderr, status } = runCheck();
      expect(status).toBe(1);
      expect(stderr).toContain("VIOLATION");
      expect(stderr).toContain("_spinner-contrast-test-savebtn-fixture.tsx");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("does NOT flag self-closing <SaveButton /> (no children, cannot contain a spinner)", () => {
    // Self-closing SaveButton is the common admin pattern used as an `actions={}` prop.
    // A spinner inside the Suspense fallback nearby should not be mistakenly flagged.
    const srcDir = path.join(
      WORKSPACE_ROOT,
      "artifacts/hospitality-business-portal/src"
    );
    const tmpFile = path.join(srcDir, "_spinner-contrast-test-savebtn-selfclose-fixture.tsx");
    const okJsx = [
      "// AUTO-GENERATED TEST FIXTURE — deleted after test",
      'import { Loader2 } from "@/components/icons/themed-icons";',
      'import { SaveButton } from "@/components/ui/save-button";',
      "export function Fixture({ saveState }: any) {",
      "  return (",
      "    <PageHeader",
      "      actions={",
      "        saveState ? (",
      "          <SaveButton",
      '            onClick={saveState.onSave}',
      "            hasChanges={saveState.isDirty}",
      "            isPending={saveState.isPending}",
      "          />",
      "        ) : undefined",
      "      }",
      "    />",
      "    <div>",
      '      <Loader2 className="w-6 h-6 animate-spin text-accent-pop" />',
      "    </div>",
      "  );",
      "}",
    ].join("\n");

    try {
      fs.writeFileSync(tmpFile, okJsx, "utf8");
      const { stdout, status } = runCheck();
      expect(status).toBe(0);
      expect(stdout).toContain("PASS");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("does NOT flag text-white spinners inside dark buttons", () => {
    const srcDir = path.join(
      WORKSPACE_ROOT,
      "artifacts/hospitality-business-portal/src"
    );
    const tmpFile = path.join(srcDir, "_spinner-contrast-test-white-fixture.tsx");
    const okJsx = [
      "// AUTO-GENERATED TEST FIXTURE — deleted after test",
      'import { Loader2 } from "@/components/icons/themed-icons";',
      "export function Fixture() {",
      "  return (",
      '    <Button variant="default">',
      '      <Loader2 className="animate-spin text-white" />',
      "    </Button>",
      "  );",
      "}",
    ].join("\n");

    try {
      fs.writeFileSync(tmpFile, okJsx, "utf8");
      const { stdout, status } = runCheck();
      expect(status).toBe(0);
      expect(stdout).toContain("PASS");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
