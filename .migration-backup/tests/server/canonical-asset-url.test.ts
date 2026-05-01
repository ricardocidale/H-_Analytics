import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Task #521 — static contract tests for the legacy /objects/uploads
 * canonicalisation guard. Behavioural tests against the live DB live in
 * the reconcile script; these tests verify the wiring stays in place so
 * future edits cannot silently bypass the guard.
 */

const repoRoot = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.resolve(repoRoot, rel), "utf-8");

const helperSrc = read("server/lib/canonical-asset-url.ts");
const assetSrc = read("server/ai/asset-intelligence.ts");
const rebeccaStorageSrc = read("server/storage/intelligence-rebecca.ts");
const activitySrc = read("server/storage/activity.ts");

describe("canonical-asset-url helper", () => {
  it("exports the three canonicalisation primitives", () => {
    expect(helperSrc).toContain("export function containsLegacyUploadUrl");
    expect(helperSrc).toContain("export async function resolveCanonicalUploadUrl");
    expect(helperSrc).toContain("export async function rewriteLegacyUploadsInText");
    expect(helperSrc).toContain("export async function rewriteLegacyUploadsInMetadata");
  });

  it("resolves property-photo legacy URLs to the canonical /api/property-photos/<id>/image form", () => {
    expect(helperSrc).toMatch(/SELECT id FROM property_photos WHERE image_url = \$\{legacyUrl\}/);
    expect(helperSrc).toContain("`/api/property-photos/${photoRes.rows[0].id}/image`");
  });

  it("resolves logo legacy URLs by looking up a sibling /api/media row on the same company", () => {
    expect(helperSrc).toMatch(/SELECT company_name FROM logos WHERE url = \$\{legacyUrl\}/);
    expect(helperSrc).toContain("AND url LIKE '/api/media/%'");
  });

  it("returns null (rather than guessing) when no canonical sink exists", () => {
    // The function falls through to `return null;` when neither branch matches.
    expect(helperSrc).toMatch(/return null;\s*\n}\s*\n\s*\/\*\*[\s\S]*Scan a free-text body/);
  });
});

describe("asset-intelligence — Rebecca prompt surface", () => {
  it("emits canonical /api/property-photos/<id>/image URLs when indexing photos (never raw imageUrl)", () => {
    expect(assetSrc).toContain("function canonicalPhotoUrl(photoId: number)");
    expect(assetSrc).toContain("`/api/property-photos/${photoId}/image`");
    // The legacy `url: photo.imageUrl` write must be gone.
    expect(assetSrc).not.toMatch(/url:\s*photo\.imageUrl/);
  });

  it("canonicalises legacy logo URLs at indexing time (and skips unresolvable ones)", () => {
    expect(assetSrc).toContain("safeCanonicalLogoUrl(logo.url)");
    expect(assetSrc).toMatch(/Skipped \$\{skippedLegacy\} logo\(s\) with unresolvable legacy/);
  });

  it("canonicalises logo URLs again at query time so pre-Task-#521 vector entries can't leak", () => {
    // The vector-store query path goes through safeCanonicalLogoUrl on logo metadata.
    expect(assetSrc).toMatch(/const canonical = await safeCanonicalLogoUrl\(rawUrl\);/);
    // And the fallback search path also normalises.
    expect(assetSrc).toMatch(/const canonical = await safeCanonicalLogoUrl\(logo\.url\);/);
  });

  it("never returns photo metadata URLs straight from the vector store", () => {
    // The query-time photo branch must rewrite to canonicalPhotoUrl(id), not String(m.metadata.url).
    expect(assetSrc).toMatch(/url:\s*canonicalPhotoUrl\(id\)/);
  });
});

describe("storage write guards — addRebeccaMessage", () => {
  it("invokes the canonicaliser before inserting message content", () => {
    expect(rebeccaStorageSrc).toContain('from "../lib/canonical-asset-url"');
    expect(rebeccaStorageSrc).toContain("containsLegacyUploadUrl(data.content)");
    expect(rebeccaStorageSrc).toContain("rewriteLegacyUploadsInText(data.content)");
  });

  it("inserts the rewritten value (not the original data) when canonicalisation succeeds", () => {
    // The insert uses `values` which gets reassigned to the rewritten payload.
    expect(rebeccaStorageSrc).toMatch(/values = \{ \.\.\.data, content: result\.text \}/);
    expect(rebeccaStorageSrc).toMatch(/\.values\(values as typeof rebeccaMessages\.\$inferInsert\)/);
  });
});

describe("storage write guards — createActivityLog", () => {
  it("invokes the metadata canonicaliser before inserting", () => {
    expect(activitySrc).toContain('from "../lib/canonical-asset-url"');
    expect(activitySrc).toContain("rewriteLegacyUploadsInMetadata(");
  });

  it("inserts the rewritten metadata (not the original data) when canonicalisation succeeds", () => {
    expect(activitySrc).toMatch(/values = \{ \.\.\.data, metadata: result\.metadata/);
    expect(activitySrc).toMatch(/\.values\(values as typeof activityLogs\.\$inferInsert\)/);
  });
});
