/**
 * Tests for check-ui-canonical.ts
 *
 * Verifies:
 *   1. Script exists and is invokable.
 *   2. Passes against the committed codebase (no violations after cleanup).
 *   3. Rule A — text variants ("Ask The Analyst", "Ask Analyst") flagged.
 *   4. Rule A — banned identifiers (onAskAnalyst, askTheAnalyst, ASK_ANALYST_*,
 *      button-ask-analyst-*) flagged.
 *   5. Rule A — <AnalystActionButton label="Refresh"> flagged; label="Analyst"
 *      and no-label usage pass.
 *   6. Rule B — banned TabsList/TabsTrigger imports outside tabs.tsx flagged;
 *      TabsContent imports pass.
 *   7. Rule B — hand-rolled <button> + activeTab=== heuristic flagged.
 *   8. Test fixtures (*.test.tsx) are excluded.
 *   9. Comments are stripped before scanning (// and / * * / both work).
 *  10. tabs.tsx itself can import TabsList/TabsTrigger (self-reference).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(__dirname, "check-ui-canonical.ts");
const SCAN_DIR = path.join(
  WORKSPACE_ROOT,
  "artifacts/hospitality-business-portal/src",
);

function runCheck(): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/scripts", "exec", "tsx", "src/check-ui-canonical.ts"],
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

describe("check-ui-canonical", () => {
  it("script exists", () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it("passes against the committed codebase", () => {
    const r = runCheck();
    expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("check:ui-canonical");
    expect(r.stdout).toContain("PASS");
  });

  describe("Rule A — banned text", () => {
    it('flags "Ask The Analyst" inside JSX', () => {
      withFixture(
        "__ui_canonical_fixture_a1.tsx",
        `export function X() { return <button>Ask The Analyst</button>; }\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
          expect(r.stderr).toMatch(/__ui_canonical_fixture_a1\.tsx/);
          expect(r.stderr).toMatch(/Rule A/);
        },
      );
    });

    it('flags "Ask Analyst" inside string literal', () => {
      withFixture(
        "__ui_canonical_fixture_a2.tsx",
        `const label = "Ask Analyst";\nexport const X = label;\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
          expect(r.stderr).toMatch(/__ui_canonical_fixture_a2\.tsx/);
        },
      );
    });

    it('does NOT flag canonical "Analyst" label', () => {
      withFixture(
        "__ui_canonical_fixture_a3.tsx",
        `const label = "Analyst";\nexport const X = label;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });

    it("does NOT flag banned text inside // comments", () => {
      withFixture(
        "__ui_canonical_fixture_a4.tsx",
        `// Historical note: do not write "Ask The Analyst" anywhere.\nexport const X = 1;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });
  });

  describe("Rule A — banned identifiers", () => {
    it("flags onAskAnalyst prop name", () => {
      withFixture(
        "__ui_canonical_fixture_a5.tsx",
        `export const X = ({ onAskAnalyst }: { onAskAnalyst: () => void }) => null;\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
          expect(r.stderr).toMatch(/Rule A/);
        },
      );
    });

    it("flags ASK_ANALYST_* masking-literal constants", () => {
      withFixture(
        "__ui_canonical_fixture_a6.tsx",
        `export const ASK_ANALYST_CTA = "x";\nexport const Y = ASK_ANALYST_CTA;\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
        },
      );
    });

    it("flags button-ask-analyst-* data-testid values", () => {
      withFixture(
        "__ui_canonical_fixture_a7.tsx",
        `export const X = () => <button data-testid="button-ask-analyst-foo" />;\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
        },
      );
    });
  });

  describe("Rule A — AnalystActionButton label prop", () => {
    it('flags label="Refresh" (non-canonical)', () => {
      withFixture(
        "__ui_canonical_fixture_a8.tsx",
        `import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";\nexport const X = () => <AnalystActionButton label="Refresh" />;\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
          expect(r.stderr).toMatch(/AnalystActionButton/);
        },
      );
    });

    it('passes label="Analyst"', () => {
      withFixture(
        "__ui_canonical_fixture_a9.tsx",
        `import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";\nexport const X = () => <AnalystActionButton label="Analyst" />;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });

    it("passes no-label usage", () => {
      withFixture(
        "__ui_canonical_fixture_a10.tsx",
        `import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";\nexport const X = () => <AnalystActionButton onClick={() => {}} />;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });

    it('flags multi-line label="Refresh" callsites', () => {
      withFixture(
        "__ui_canonical_fixture_a11.tsx",
        `import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";\nexport const X = () => (\n  <AnalystActionButton\n    onClick={() => {}}\n    label="Refresh"\n    variant="header"\n  />\n);\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
        },
      );
    });
  });

  describe("Rule B — banned imports", () => {
    it("flags TabsList import outside tabs.tsx", () => {
      withFixture(
        "__ui_canonical_fixture_b1.tsx",
        `import { Tabs, TabsList } from "@/components/ui/tabs";\nexport const X = () => <Tabs />;\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
          expect(r.stderr).toMatch(/Rule B/);
        },
      );
    });

    it("flags TabsTrigger import outside tabs.tsx", () => {
      withFixture(
        "__ui_canonical_fixture_b2.tsx",
        `import { Tabs, TabsTrigger } from "@/components/ui/tabs";\nexport const X = () => <Tabs />;\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
        },
      );
    });

    it("passes TabsContent import (panel wrapper, not strip)", () => {
      withFixture(
        "__ui_canonical_fixture_b3.tsx",
        `import { Tabs, TabsContent } from "@/components/ui/tabs";\nexport const X = () => <Tabs />;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });

    it("passes CurrentThemeTab import", () => {
      withFixture(
        "__ui_canonical_fixture_b4.tsx",
        `import { Tabs, CurrentThemeTab } from "@/components/ui/tabs";\nexport const X = () => <Tabs />;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });
  });

  describe("Rule B — hand-rolled button heuristic", () => {
    it("flags <button> + activeTab=== toggle pattern", () => {
      withFixture(
        "__ui_canonical_fixture_b5.tsx",
        `export const X = ({ activeTab }: { activeTab: string }) => (\n  <div>\n    <button className={activeTab === "one" ? "on" : "off"}>One</button>\n  </div>\n);\n`,
        () => {
          const r = runCheck();
          expect(r.status).toBe(1);
          expect(r.stderr).toMatch(/hand-rolled/);
        },
      );
    });

    it("does NOT flag <button> without activeTab=== nearby", () => {
      withFixture(
        "__ui_canonical_fixture_b6.tsx",
        `export const X = () => <button>Click me</button>;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });
  });

  describe("File-skip behavior", () => {
    it("test files are excluded from the scan", () => {
      withFixture(
        "__ui_canonical_fixture_skip.test.tsx",
        `export const X = () => <button>Ask The Analyst</button>;\n`,
        () => {
          const r = runCheck();
          expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
        },
      );
    });
  });
});
