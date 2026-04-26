/**
 * Analyst Trigger Discipline — proof test enforcing the binding rule
 * `.claude/rules/analyst-trigger-discipline.md`.
 *
 * The Analyst (Surface Router / Specialist dispatch) MUST run only on an
 * explicit `<AnalystButton />` press. Save handlers, autosave handlers,
 * navigation effects, mount effects, and timer-driven loops MUST NOT
 * dispatch a Specialist or call into the cognitive engine.
 *
 * This test pins the rule statically — by scanning the source of the
 * non-AnalystButton save/effect surfaces — so a future edit that silently
 * re-introduces a save-time dispatch (the regression that motivated
 * G1.5b-pre) is caught at PR time instead of in production.
 *
 * Surfaces inspected:
 * - server/routes/global-assumptions.ts (POST /api/global-assumptions/save-tab)
 *
 * Future surfaces SHOULD be added to FORBIDDEN_DISPATCH_FILES as new
 * save/autosave/effect handlers are written.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

/**
 * Extract the body of `app.post("/api/global-assumptions/save-tab", ...)`
 * from the source. Returns the substring spanning from the route
 * declaration to its matching closing `});` (brace-balanced). Used so
 * the response-shape check inspects only the handler body, not unrelated
 * routes in the same file.
 */
function extractSaveTabHandler(src: string): string {
  const startMarker = /app\.post\(\s*["']\/api\/global-assumptions\/save-tab["']/;
  const startMatch = src.match(startMarker);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(
      "Could not locate POST /api/global-assumptions/save-tab handler — " +
        "did the route move or get renamed?",
    );
  }
  const startIdx = startMatch.index;
  // Walk the source from the route start, tracking paren/brace depth, and
  // stop at the matching close. Skip over string literals and line/block
  // comments so braces inside strings don't confuse the counter.
  let i = startIdx;
  let parenDepth = 0;
  let braceDepth = 0;
  let started = false;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    // Single-line comment
    if (ch === "/" && next === "/") {
      const eol = src.indexOf("\n", i);
      i = eol === -1 ? src.length : eol + 1;
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    // String literals — skip to matching quote
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") {
      parenDepth--;
      if (started && parenDepth === 0 && braceDepth === 0) {
        return src.slice(startIdx, i + 1);
      }
    } else if (ch === "{") {
      braceDepth++;
      started = true;
    } else if (ch === "}") braceDepth--;
    i++;
  }
  throw new Error("Unbalanced braces parsing save-tab handler");
}

/** Strip line + block comments so identifier scans don't false-positive
 * on commentary that happens to mention a banned token. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Files that MUST NOT contain Specialist-dispatch or cognitive-engine
 * call-sites. These are the save/autosave/effect handlers that
 * regressed in the past and are now contractually data-only.
 */
const FORBIDDEN_DISPATCH_FILES = [
  "server/routes/global-assumptions.ts",
] as const;

/**
 * Tokens that indicate a Specialist dispatch or Analyst evaluation.
 * If any of these appear in a forbidden file, the file has illegally
 * re-acquired a save-time Analyst trigger.
 *
 * - `router.dispatch(`        — SurfaceRouter dispatch call
 * - `MGMT_CO_FUNDING_ID`     — funding-Specialist id (only ever
 *                               referenced by a dispatch site or by
 *                               the required-fields gate; the gate is
 *                               allowed, so we additionally exclude
 *                               telemetry/gate code paths via the
 *                               co-occurrence check below)
 * - `MGMT_CO_REVENUE_ID`     — revenue-Specialist id (same caveat)
 * - `createMgmtCoRouter`     — router factory; never needed for a
 *                               data-only save handler
 * - `evaluateCapitalRaise(`  — deterministic CapitalRaise evaluator
 *                               (banned at save-time per the rule —
 *                               only the AnalystButton path may invoke)
 * - `evaluateRevenue(`       — deterministic Revenue evaluator (same)
 * - `consultCognitive`       — Tier-1 cognitive-engine entry point
 */
const HARD_BANNED_TOKENS = [
  "router.dispatch(",
  "createMgmtCoRouter",
  "evaluateCapitalRaise(",
  "evaluateRevenue(",
  "consultCognitive",
] as const;

describe("Analyst Trigger Discipline — save-time dispatch is banned", () => {
  for (const file of FORBIDDEN_DISPATCH_FILES) {
    it(`${file} contains no Specialist-dispatch or evaluator call-sites`, () => {
      const src = read(file);
      const hits: string[] = [];
      for (const token of HARD_BANNED_TOKENS) {
        if (src.includes(token)) hits.push(token);
      }
      expect(
        hits,
        `${file} re-acquired a save-time Analyst trigger. ` +
          `The Analyst dispatches ONLY on explicit <AnalystButton /> press ` +
          `(.claude/rules/analyst-trigger-discipline.md). ` +
          `Forbidden tokens found: ${hits.join(", ")}`,
      ).toEqual([]);
    });

    it(`${file}: save-tab handler body uses no 'verdict' or 'prerequisiteFailures' identifiers`, () => {
      // Extract the entire app.post("/api/global-assumptions/save-tab", …)
      // call expression — handler body included — and assert that neither
      // identifier appears anywhere in it (variable name, object key,
      // destructure, response-body field). This catches the regression
      // pattern where dispatch is reintroduced via a temporary variable
      // (e.g. `const responseBody = { …, verdict, prerequisiteFailures }`)
      // which a naive `res.json({ ...inline... })` regex would miss.
      const src = read(file);
      const handler = stripComments(extractSaveTabHandler(src));
      const offenders: string[] = [];
      if (/\bverdict\b/.test(handler)) offenders.push("verdict");
      if (/\bprerequisiteFailures\b/.test(handler)) offenders.push("prerequisiteFailures");
      expect(
        offenders,
        `save-tab handler must not reference these identifiers ` +
          `(G1.5b-pre-a — they are AnalystButton-press concerns now): ` +
          offenders.join(", "),
      ).toEqual([]);
    });
  }
});

describe("Analyst Trigger Discipline — rule file is present", () => {
  it("the binding rule file exists and references AnalystButton", () => {
    const rule = read(".claude/rules/analyst-trigger-discipline.md");
    // Sanity-check that the rule says what this proof test enforces.
    expect(rule).toMatch(/AnalystButton/);
    expect(rule).toMatch(/explicit/i);
  });
});

/**
 * Client-side trigger-discipline assertions for the Company Assumptions
 * surface (task #738). The server save handler is locked down by the
 * suite above; this suite locks down the *client* side that used to
 * dispatch The Analyst implicitly:
 *
 *  - useCompanyAnalyst.tsx — used to fire on `?analyst=1` deep-link
 *    and via `useAutoRefreshIntelligence`.
 *  - useCompanyAssumptionsForm.ts — used to call `generateResearch()`
 *    inside `handleSaveTab` after a successful save, and used to
 *    parse `verdict` / `prerequisiteFailures` off the save-tab
 *    response and open the watchdog dialog.
 *  - CompanyAssumptions.tsx — used to mount the
 *    `<PrerequisitesFailedPanel>` driven by the same verdict payload.
 *  - CompanyAssumptionsHeaderBar.tsx — used to mount the auto-refresh
 *    `<Switch>` ("Auto" toggle) which silently re-armed the loop.
 *
 * The Analyst evaluates ONLY on an explicit `<AnalystButton />` press
 * (.claude/rules/analyst-trigger-discipline.md). Re-introducing any of
 * the patterns below silently re-arms an implicit trigger, so we pin
 * each one statically.
 */
describe("Analyst Trigger Discipline — client save/effect surfaces", () => {
  const FORBIDDEN_CLIENT_PATTERNS: Array<{
    file: string;
    pattern: RegExp;
    why: string;
  }> = [
    {
      file: "client/src/hooks/useCompanyAnalyst.tsx",
      pattern: /useAutoRefreshIntelligence/,
      why: "auto-refresh loop dispatches The Analyst on a timer — must be removed",
    },
    {
      file: "client/src/hooks/useCompanyAnalyst.tsx",
      // Detect a useEffect that watches the URL for ?analyst=1 — i.e.
      // any reference to the deep-link query token inside this file.
      pattern: /analyst=1/,
      why: "?analyst=1 URL deep-link auto-fires generateResearch() — must be removed",
    },
    {
      file: "client/src/hooks/useCompanyAssumptionsForm.ts",
      pattern: /\bverdict\b/,
      why: "save-tab response no longer carries `verdict` (task #737) — client must not read it",
    },
    {
      file: "client/src/hooks/useCompanyAssumptionsForm.ts",
      pattern: /\bprerequisiteFailures\b/,
      why: "save-tab response no longer carries `prerequisiteFailures` — client must not read it",
    },
    {
      file: "client/src/hooks/useCompanyAssumptionsForm.ts",
      // The post-save auto-fire used to call `deps.generateResearch()`
      // when the gate was enabled. Search for any `generateResearch(`
      // CALL inside this file (the type-only mention on SaveDeps was
      // dropped in the slim, so any remaining call is a regression).
      pattern: /generateResearch\s*\(/,
      why: "Save must not call generateResearch() — Analyst runs on explicit button press only",
    },
    {
      file: "client/src/hooks/useCompanyAssumptionsForm.ts",
      pattern: /AnalystCheckDialog|handleWatchdogAction|handleProceedAnyway/,
      why: "watchdog dialog is no longer save-driven — must not be wired here",
    },
    {
      file: "client/src/components/company-assumptions/CompanyAssumptionsHeaderBar.tsx",
      pattern: /toggle-auto-refresh-company/,
      why: "auto-refresh toggle re-arms the implicit Analyst loop — must be removed",
    },
    {
      file: "client/src/components/company-assumptions/CompanyAnalystOverlay.tsx",
      pattern: /AnalystCheckDialog/,
      why: "AnalystCheckDialog mount on this overlay was driven by the now-removed save-time verdict",
    },
    {
      file: "client/src/pages/CompanyAssumptions.tsx",
      pattern: /useAutoRefreshIntelligence|toggle-auto-refresh-company/,
      why: "Company Assumptions page must not own an auto-refresh toggle or hook",
    },
  ];

  for (const { file, pattern, why } of FORBIDDEN_CLIENT_PATTERNS) {
    it(`${file}: must not contain ${pattern.source}`, () => {
      const src = stripComments(read(file));
      expect(
        pattern.test(src),
        `${file} re-acquired a forbidden trigger pattern (${pattern.source}). ` +
          `${why}. The Analyst evaluates ONLY on an explicit ` +
          `<AnalystButton /> press — see .claude/rules/analyst-trigger-discipline.md.`,
      ).toBe(false);
    });
  }

  it("the auto-refresh hook file has been deleted", () => {
    // The hook used to live at client/src/hooks/use-auto-refresh-intelligence.ts
    // and ran a timer-driven dispatch loop. Deleting the file is the
    // strongest possible guarantee against it being silently re-imported.
    expect(() => read("client/src/hooks/use-auto-refresh-intelligence.ts"))
      .toThrow();
  });

  it("the new save-tab response shape is consumed (requiredFieldsMissing) without re-introducing a trigger", () => {
    // Positive assertion: the form hook DOES handle the new shape's
    // `requiredFieldsMissing` field — proving the cleanup did not also
    // accidentally drop the legitimate non-Analyst-triggering save UX.
    const form = read("client/src/hooks/useCompanyAssumptionsForm.ts");
    expect(
      /requiredFieldsMissing/.test(form),
      "useCompanyAssumptionsForm.ts must consume the new save-tab " +
        "response field `requiredFieldsMissing` (task #737 shape) so " +
        "the page can render a non-blocking required-fields banner.",
    ).toBe(true);
  });
});
