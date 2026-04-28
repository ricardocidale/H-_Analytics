/**
 * Analyst Field-Registry Mount-Point Audit — proof test that catches the
 * silent-failure class behind task #760.
 *
 * Background:
 * The Analyst's "Adjust" CTA on a verdict dimension navigates the user to
 * the form field referenced in `engine/analyst/registry/field-registry.ts`
 * by:
 *   1. resolving the entry's `mountPoint` slug to a route via
 *      `client/src/lib/analyst-mount-points.ts::resolveFieldMountPoint`,
 *   2. appending `?focus=<fieldId>` so the destination page can scroll
 *      and focus the matching form field via `useFocusFieldFromUrl()`
 *      (`client/src/lib/analyst-focus-field.ts`).
 *
 * That hook discovers the field via two markers in DOM order of priority:
 *   - `[data-field="<fieldId>"]`  (Company Assumptions section convention)
 *   - `[data-testid="field-<fieldId>"]`  (admin Model-Defaults convention)
 *
 * Two ways the chain breaks silently — both produced the task #760 incident
 * in different forms:
 *   (a) The `mountPoint` slug doesn't begin with a prefix the resolver
 *       recognises (`property-edit/`, `company-assumptions/`, `defaults/`).
 *       `resolveFieldMountPoint` returns `null` and the CTA either no-ops
 *       or, worse, falls back to a default surface that doesn't host the
 *       field. No runtime error.
 *   (b) The slug resolves to a real route, but no form on that route (or
 *       anywhere under `client/src/`) carries a matching `data-field` /
 *       `data-testid="field-<id>"` marker. The user lands on the right
 *       page but the focus hook silently exhausts its retry budget. Again,
 *       no runtime error.
 *
 * This test pins both invariants statically:
 *   - Every `FIELD_REGISTRY` entry's `mountPoint` starts with a prefix the
 *     resolver supports. The list of supported prefixes is parsed from
 *     `analyst-mount-points.ts` so adding a new surface there
 *     auto-extends the audit (no test edit required).
 *   - Every `FIELD_REGISTRY` field id has at least one `data-field="<id>"`
 *     or `data-testid="field-<id>"` marker somewhere under `client/src/`.
 *
 * Adding a Specialist field that points at a non-existent surface OR that
 * forgets to wire the form-side marker now fails CI before it ships.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { FIELD_REGISTRY } from "../../engine/analyst/registry/field-registry";

const ROOT = join(__dirname, "../..");
const CLIENT_SRC = join(ROOT, "client/src");
const RESOLVER_PATH = join(ROOT, "client/src/lib/analyst-mount-points.ts");

/**
 * Parse the supported mount-point prefixes out of the resolver source by
 * scanning for `slug.startsWith("...")` calls. Keeping this dynamic means
 * the test doesn't go stale when a new surface is added — adding a fourth
 * `slug.startsWith("…")` branch in the resolver automatically extends the
 * set of prefixes the audit treats as valid.
 */
function parseSupportedPrefixes(): readonly string[] {
  const src = readFileSync(RESOLVER_PATH, "utf-8");
  const re = /slug\.startsWith\(\s*["']([^"']+)["']\s*\)/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    found.add(m[1]);
  }
  if (found.size === 0) {
    throw new Error(
      "Could not parse any `slug.startsWith(...)` prefixes out of " +
        "client/src/lib/analyst-mount-points.ts — has the resolver been " +
        "rewritten? Update this audit to match its new structure.",
    );
  }
  return Array.from(found);
}

/**
 * Recursively list `.ts`/`.tsx` files under `dir` (absolute path), skipping
 * `node_modules`, `.git`, and TypeScript declaration files. Mirrors the
 * convention used by other proof tests (see orphan-files.test.ts).
 */
function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...listSourceFiles(p));
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".d.ts")) continue;
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(p);
      }
    }
  }
  return out;
}

/**
 * Concatenate the full text of every source file under `client/src/` once.
 * The marker check is a substring scan, so building one big haystack is
 * dramatically cheaper than running a regex over each file per field.
 *
 * Module-level memoisation: both `it()` blocks share the same haystack.
 */
let clientHaystackCache: string | null = null;
function getClientHaystack(): string {
  if (clientHaystackCache !== null) return clientHaystackCache;
  const files = listSourceFiles(CLIENT_SRC);
  const parts: string[] = [];
  for (const f of files) {
    parts.push(readFileSync(f, "utf-8"));
  }
  clientHaystackCache = parts.join("\n");
  return clientHaystackCache;
}

function hasMarkerForField(fieldId: string, haystack: string): boolean {
  // Two marker conventions per `analyst-focus-field.ts::findFieldElement`:
  //   1. `data-field="<id>"` — direct attribute (Company Assumptions style).
  //   2. `data-testid="field-<id>"` — set either directly OR forwarded
  //      through a helper prop (e.g. the admin Model-Defaults
  //      `PctField`/`DollarField`/`NumberField` helpers in
  //      `FieldHelpers.tsx` accept `testId` and render
  //      `data-testid={testId}`). To cover both the direct and
  //      forwarded-prop spellings without listing every helper, we match
  //      the quoted literal `"field-<id>"` anywhere — its appearance in
  //      source means the value flows into `data-testid` via JSX.
  // Single- and double-quoted JSX attribute syntaxes both appear in the
  // codebase, so accept either.
  return (
    haystack.includes(`data-field="${fieldId}"`) ||
    haystack.includes(`data-field='${fieldId}'`) ||
    haystack.includes(`"field-${fieldId}"`) ||
    haystack.includes(`'field-${fieldId}'`)
  );
}

describe("Analyst FIELD_REGISTRY mount-point & marker audit", () => {
  const SUPPORTED_PREFIXES = parseSupportedPrefixes();
  const ENTRIES = Object.entries(FIELD_REGISTRY);

  it("has at least one registered field (sanity check)", () => {
    // Guards against a refactor that empties FIELD_REGISTRY — the loop-based
    // assertions below would vacuously pass and the audit would silently
    // stop catching anything.
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("every mountPoint starts with a prefix `resolveFieldMountPoint` supports", () => {
    const violations: string[] = [];
    for (const [fieldId, entry] of ENTRIES) {
      const ok = SUPPORTED_PREFIXES.some((prefix) =>
        entry.mountPoint.startsWith(prefix),
      );
      if (!ok) {
        violations.push(
          `  - "${fieldId}": mountPoint="${entry.mountPoint}" ` +
            `does not start with any supported prefix ` +
            `(${SUPPORTED_PREFIXES.map((p) => `"${p}"`).join(", ")})`,
        );
      }
    }
    if (violations.length > 0) {
      throw new Error(
        "FIELD_REGISTRY entries point at unsupported mount-point surfaces — " +
          "the Analyst's 'Adjust' CTA will silently no-op for these fields " +
          "(see task #760 for the incident this audit prevents):\n" +
          violations.join("\n") +
          "\n\nFix: either correct the slug to one of the supported prefixes " +
          "above, or extend `resolveFieldMountPoint` in " +
          "client/src/lib/analyst-mount-points.ts to handle the new surface.",
      );
    }
  });

  it("every field id has a matching data-field or data-testid marker under client/src/", () => {
    const haystack = getClientHaystack();
    const violations: string[] = [];
    for (const [fieldId, entry] of ENTRIES) {
      if (!hasMarkerForField(fieldId, haystack)) {
        violations.push(
          `  - "${fieldId}" (mountPoint="${entry.mountPoint}"): ` +
            `no \`data-field="${fieldId}"\` or \`data-testid="field-${fieldId}"\` ` +
            `marker found under client/src/`,
        );
      }
    }
    if (violations.length > 0) {
      throw new Error(
        "FIELD_REGISTRY entries have no form-side marker for the " +
          "Analyst's focus hook to find — the 'Adjust' CTA will land on " +
          "the right page but silently fail to scroll/focus the field " +
          "(see task #760 for the incident this audit prevents):\n" +
          violations.join("\n") +
          "\n\nFix: add `data-field=\"<fieldId>\"` (Company Assumptions " +
          "convention) or `data-testid=\"field-<fieldId>\"` (admin " +
          "Model-Defaults convention) to the form input or its labeled " +
          "wrapper. See `client/src/lib/analyst-focus-field.ts::" +
          "findFieldElement` for the exact selectors the hook uses.",
      );
    }
  });
});
