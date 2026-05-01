/**
 * Analyst Adjust deep-link destination-marker audit (task #771).
 *
 * Sibling to `analyst-field-registry-mount-points.test.ts`, which guarantees:
 *   (a) every `FIELD_REGISTRY` entry's `mountPoint` slug starts with a
 *       prefix `resolveFieldMountPoint` recognises, and
 *   (b) every field id has a `data-field="<id>"` or
 *       `data-testid="field-<id>"` marker *somewhere* under `client/src/`.
 *
 * That looser check (b) catches "no marker exists at all" but is silent
 * about a different — and more dangerous — drift: a registry entry whose
 * `mountPoint` points at one surface, while the matching marker only lives
 * on a different surface. Concrete failure modes (#760 was an instance of
 * the first):
 *   - A funding field's `mountPoint` was `property-edit/capital-raise`,
 *     but its `data-field` markers lived on the Company Assumptions
 *     funding tab. The user clicked Adjust, landed on the wrong page,
 *     and the focus hook silently no-op'd.
 *   - A tab gets renamed (`funding` → `funding-financing`) but the
 *     registry still says `company-assumptions/funding`. The destination
 *     route 404s or renders an empty tab; the focus hook never sees the
 *     marker.
 *   - A section component gets refactored away (e.g. revenue defaults
 *     moved out of `PropertyUnderwritingTab.tsx` into a new file) and
 *     nobody updates the registry's `defaults/revenue` slug. The slug
 *     resolves, but the markers are gone from that destination.
 *
 * This audit closes the gap by enforcing destination-scoped marker checks:
 * for every `mountPoint` slug used by the registry, we declare the exact
 * file(s) that host that surface, and we require every field id pointing
 * at that slug to have a marker inside at least one of those files.
 *
 * Adding a new surface (slug):
 *   1. Add an entry to `MOUNT_POINT_DESTINATIONS` in
 *      `tests/proof/_helpers/analyst-mount-point-destinations.ts` (the
 *      shared map this audit imports — also consumed by the default-state
 *      visibility audit, so one edit covers both). The file paths are
 *      relative to the repo root.
 *   2. The test will fail if the registry uses a slug not present in the
 *      map — that's the forcing function. It will also fail if the file
 *      doesn't exist (so a tab rename / file move is caught immediately)
 *      or if any field id pointing at the slug has no marker in the file.
 *
 * Why hard-code file paths rather than scan the whole `client/src/`:
 *   The looser scan is already done by the sibling test. The whole point
 *   of this audit is to catch "marker exists, but on the wrong page" —
 *   which only the per-destination scope can detect.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { FIELD_REGISTRY } from "../../engine/analyst/registry/field-registry";
// Single source of truth for slug → destination file(s). Shared with
// `analyst-field-registry-default-state-visibility.test.ts` — see the
// helper file's header for the rationale (task #786).
import { MOUNT_POINT_DESTINATIONS } from "./_helpers/analyst-mount-point-destinations";

const ROOT = join(__dirname, "../..");

/**
 * The same two marker conventions used by the focus hook
 * (`client/src/lib/analyst-focus-field.ts::findFieldElement`):
 *   1. `data-field="<id>"` — direct attribute (Company Assumptions style).
 *   2. `data-testid="field-<id>"` — set either directly or forwarded
 *      through a helper prop. The PropertyUnderwritingTab fields use the
 *      Model-Defaults `PctField`/`DollarField`/`NumberField` helpers,
 *      which accept `testId="field-<id>"` and render
 *      `data-testid={testId}` (see FieldHelpers.tsx). Matching the quoted
 *      literal `"field-<id>"` covers both the direct and forwarded-prop
 *      spellings without enumerating every helper.
 *
 * Both single- and double-quoted JSX attribute syntaxes appear in this
 * codebase, so accept either.
 */
function hasMarkerForField(fieldId: string, source: string): boolean {
  return (
    source.includes(`data-field="${fieldId}"`) ||
    source.includes(`data-field='${fieldId}'`) ||
    source.includes(`"field-${fieldId}"`) ||
    source.includes(`'field-${fieldId}'`)
  );
}

interface DestinationFile {
  readonly path: string;
  readonly source: string;
}

/**
 * Read every destination file for `slug`, asserting each one exists.
 * Throws (with a precise message) when the slug isn't mapped or when a
 * mapped file is missing — both are blocker-level failures that mean the
 * map has drifted from the codebase.
 */
function loadDestinations(slug: string): DestinationFile[] {
  const paths = MOUNT_POINT_DESTINATIONS[slug];
  if (!paths) {
    throw new Error(
      `FIELD_REGISTRY uses mountPoint slug "${slug}" but the deep-link ` +
        `destination audit has no entry for it. Add an entry to ` +
        `MOUNT_POINT_DESTINATIONS in ` +
        `tests/proof/_helpers/analyst-mount-point-destinations.ts ` +
        `mapping the slug to the file(s) that host its form-side markers.`,
    );
  }
  const out: DestinationFile[] = [];
  for (const rel of paths) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      throw new Error(
        `MOUNT_POINT_DESTINATIONS["${slug}"] points at "${rel}" but that ` +
          `file does not exist. Either the file was renamed/moved (update ` +
          `the map) or the surface is gone (move the registry entries to ` +
          `a different mountPoint).`,
      );
    }
    out.push({ path: rel, source: readFileSync(abs, "utf-8") });
  }
  return out;
}

describe("Analyst Adjust deep-link destination-marker audit", () => {
  const ENTRIES = Object.entries(FIELD_REGISTRY);

  it("has at least one registered field (sanity check)", () => {
    // Mirrors the sanity check in the sibling parity test — guards
    // against a refactor that empties FIELD_REGISTRY, which would make
    // every assertion below vacuously pass.
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it("MOUNT_POINT_DESTINATIONS covers every mountPoint slug used by FIELD_REGISTRY", () => {
    // Independent forcing-function: even if no field has a marker problem
    // today, an unmapped slug means the audit can't see the next surface
    // that gets added. Surfacing the missing map entry up front gives a
    // clearer error than a per-field marker miss.
    const usedSlugs = new Set<string>();
    for (const [, entry] of ENTRIES) usedSlugs.add(entry.mountPoint);
    const unmapped: string[] = [];
    for (const slug of usedSlugs) {
      if (!(slug in MOUNT_POINT_DESTINATIONS)) unmapped.push(slug);
    }
    if (unmapped.length > 0) {
      throw new Error(
        "FIELD_REGISTRY uses mountPoint slugs that the deep-link " +
          "destination audit doesn't know about. Add an entry to " +
          "MOUNT_POINT_DESTINATIONS in " +
          "tests/proof/_helpers/analyst-mount-point-destinations.ts " +
          "for each of:\n" +
          unmapped.map((s) => `  - "${s}"`).join("\n"),
      );
    }
  });

  it("every mapped destination file exists on disk", () => {
    // Catches tab/file renames the moment they happen, before any of the
    // per-field marker checks run (those would otherwise fail with a
    // confusing "marker not found" rather than the real cause).
    const missing: string[] = [];
    for (const [slug, paths] of Object.entries(MOUNT_POINT_DESTINATIONS)) {
      for (const rel of paths) {
        if (!existsSync(join(ROOT, rel))) {
          missing.push(`  - "${slug}" → "${rel}"`);
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        "MOUNT_POINT_DESTINATIONS points at file(s) that no longer " +
          "exist — either the file was renamed/moved (update the map) " +
          "or the surface is gone (move the registry entries to a " +
          "different mountPoint):\n" +
          missing.join("\n"),
      );
    }
  });

  it("every field id has a marker in the file(s) that render its mountPoint", () => {
    const violations: string[] = [];
    // Memoise destination loads so a slug with N fields doesn't re-read
    // its file N times.
    const cache = new Map<string, DestinationFile[]>();
    for (const [fieldId, entry] of ENTRIES) {
      let dests = cache.get(entry.mountPoint);
      if (!dests) {
        dests = loadDestinations(entry.mountPoint);
        cache.set(entry.mountPoint, dests);
      }
      const matchingFile = dests.find((d) =>
        hasMarkerForField(fieldId, d.source),
      );
      if (!matchingFile) {
        violations.push(
          `  - "${fieldId}" (mountPoint="${entry.mountPoint}"): no ` +
            `\`data-field="${fieldId}"\` or \`data-testid="field-${fieldId}"\` ` +
            `marker found in any of [${dests.map((d) => `"${d.path}"`).join(", ")}]`,
        );
      }
    }
    if (violations.length > 0) {
      throw new Error(
        "FIELD_REGISTRY entries point at a mountPoint whose destination " +
          "file(s) don't render a matching marker — the Analyst's 'Adjust' " +
          "CTA will land on the right page but silently fail to scroll/" +
          "focus the field (this is exactly the silent-failure class of " +
          "task #760, but for any future drift):\n" +
          violations.join("\n") +
          "\n\nFix one of the following:\n" +
          "  - Add the missing `data-field=\"<fieldId>\"` (Company " +
          "Assumptions convention) or `data-testid=\"field-<fieldId>\"` " +
          "(admin Model-Defaults convention) to the input on the " +
          "destination file(s).\n" +
          "  - Update the registry's `mountPoint` to point at the file " +
          "where the marker actually lives.\n" +
          "  - If the surface was split into a new file, add it to " +
          "MOUNT_POINT_DESTINATIONS in " +
          "tests/proof/_helpers/analyst-mount-point-destinations.ts.",
      );
    }
  });
});
