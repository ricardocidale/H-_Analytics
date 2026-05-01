/**
 * tax-bulletin-diff — contract tests for Helena's deterministic tool.
 *
 * These tests cover the four contractual behaviors from the doctrine:
 *   1. Cache miss → full fetch, every parsed field shows up as "changed".
 *   2. Cache hit, identical hash → empty diff (unchangedFields populated).
 *   3. Cache hit, content changed → only the moved fields appear in diff.
 *   4. Parser extracts zero fields from non-empty payload → tool throws
 *      `BulletinParseError`. The tool itself NEVER silently degrades to
 *      LLM — that decision lives in the caller.
 *
 * No live HTTP — every test injects a `BulletinFetcher` stub.
 */

import { describe, it, expect } from "vitest";
import {
  runTaxBulletinDiff,
  diffBulletin,
  hashBulletin,
  isJurisdictionSupported,
  getBulletinSource,
  BulletinParseError,
  BulletinFetchError,
  UnsupportedJurisdictionError,
  MIN_PARSE_CONFIDENCE_FOR_TRUST,
  type BulletinFetcher,
  type JurisdictionKey,
} from "../../server/ai/tools/tax-bulletin-diff";

const US_FEDERAL: JurisdictionKey = { country: "United States", subdivision: null };

// A realistic IRS-shaped payload that the parser CAN handle. We keep it
// short but include both expected fields so parseConfidence == 1.
const BULLETIN_V1 = `
  Corporations: The federal corporate income tax rate is 21% for tax years
  beginning after December 31, 2017. Capital gains for C corporations are
  taxed at the federal corporate rate of 21%.
`;

// Same shape, different rate values — exercises the "changed" branch.
const BULLETIN_V2 = `
  Corporations: The federal corporate income tax rate is 23% for tax years
  beginning after December 31, 2025. Capital gains for C corporations are
  taxed at the federal corporate rate of 23%.
`;

const BULLETIN_NOISE = `
  This page intentionally contains no tax information.
  Pricing, scheduling, and FAQ content goes here.
`;

function fetcherReturning(text: string, status = 200): BulletinFetcher {
  return async () => ({ status, text });
}

describe("tax-bulletin-diff — registry & support detection", () => {
  it("declares US federal as supported", () => {
    expect(isJurisdictionSupported(US_FEDERAL)).toBe(true);
    expect(getBulletinSource(US_FEDERAL).publisher).toMatch(/Internal Revenue|IRS/i);
  });

  it("rejects an unconfigured jurisdiction with a typed error", () => {
    const j: JurisdictionKey = { country: "Atlantis", subdivision: null };
    expect(isJurisdictionSupported(j)).toBe(false);
    expect(() => getBulletinSource(j)).toThrow(UnsupportedJurisdictionError);
  });
});

describe("tax-bulletin-diff — pure helpers", () => {
  it("hashBulletin is whitespace-insensitive", () => {
    const a = hashBulletin("Foo  Bar   Baz");
    const b = hashBulletin("foo bar baz");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("diffBulletin reports every field as changed when no cache", () => {
    const result = diffBulletin({
      jurisdiction: US_FEDERAL,
      fetched: { url: "x", publisher: "p", retrievedAt: "2026-01-01T00:00:00Z", rawText: BULLETIN_V1 },
      parsed: {
        parsedValues: { taxRate: 0.21, capitalGainsRate: 0.21 },
        excerpts: { taxRate: "21%", capitalGainsRate: "21%" },
      },
      expectedFields: ["taxRate", "capitalGainsRate"],
      cached: null,
    });
    expect(result.changedFields).toHaveLength(2);
    expect(result.unchangedFields).toHaveLength(0);
    expect(result.parseConfidence).toBe(1);
    // Citations are 1:1 with changed fields here (no cache hit branch).
    expect(result.citations).toHaveLength(2);
    expect(result.changedFields[0].previousValue).toBeNull();
  });
});

describe("tax-bulletin-diff — composed runTaxBulletinDiff", () => {
  it("cache miss → all parsed fields surface as changed (with hash)", async () => {
    const result = await runTaxBulletinDiff({
      jurisdiction: US_FEDERAL,
      cached: null,
      fetcher: fetcherReturning(BULLETIN_V1),
      now: () => new Date("2026-04-23T12:00:00Z"),
    });
    expect(result.parsedValues.taxRate).toBe(0.21);
    expect(result.parsedValues.capitalGainsRate).toBe(0.21);
    expect(result.changedFields.map((f) => f.fieldKey).sort()).toEqual(
      ["capitalGainsRate", "taxRate"],
    );
    expect(result.parseConfidence).toBeGreaterThanOrEqual(MIN_PARSE_CONFIDENCE_FOR_TRUST);
    expect(result.bulletinHash).toBe(hashBulletin(BULLETIN_V1));
    expect(result.fetchedAt).toBe("2026-04-23T12:00:00.000Z");
    expect(result.publisher).toMatch(/Internal Revenue|IRS/i);
  });

  it("cache hit, same payload → empty changedFields, all unchanged", async () => {
    const cachedHash = hashBulletin(BULLETIN_V1);
    const result = await runTaxBulletinDiff({
      jurisdiction: US_FEDERAL,
      cached: {
        bulletinHash: cachedHash,
        parsedValues: { taxRate: 0.21, capitalGainsRate: 0.21 },
        fetchedAt: "2026-01-01T00:00:00Z",
      },
      fetcher: fetcherReturning(BULLETIN_V1),
    });
    expect(result.bulletinHash).toBe(cachedHash);
    expect(result.changedFields).toHaveLength(0);
    expect(result.unchangedFields.sort()).toEqual(["capitalGainsRate", "taxRate"]);
  });

  it("cache hit, content changed → only the moved fields appear in diff", async () => {
    const result = await runTaxBulletinDiff({
      jurisdiction: US_FEDERAL,
      cached: {
        bulletinHash: hashBulletin(BULLETIN_V1),
        // Both cached at 21%; only taxRate "moves" if we lie about
        // capitalGainsRate's previous value matching the new one.
        parsedValues: { taxRate: 0.21, capitalGainsRate: 0.23 },
        fetchedAt: "2026-01-01T00:00:00Z",
      },
      fetcher: fetcherReturning(BULLETIN_V2),
    });
    expect(result.bulletinHash).toBe(hashBulletin(BULLETIN_V2));
    const changedKeys = result.changedFields.map((f) => f.fieldKey);
    expect(changedKeys).toContain("taxRate");
    expect(changedKeys).not.toContain("capitalGainsRate");
    const taxRateChange = result.changedFields.find((f) => f.fieldKey === "taxRate")!;
    expect(taxRateChange.previousValue).toBe(0.21);
    expect(taxRateChange.newValue).toBe(0.23);
  });

  it("parser finds nothing → throws BulletinParseError (no silent fallback)", async () => {
    await expect(
      runTaxBulletinDiff({
        jurisdiction: US_FEDERAL,
        cached: null,
        fetcher: fetcherReturning(BULLETIN_NOISE),
      }),
    ).rejects.toBeInstanceOf(BulletinParseError);
  });

  it("non-2xx response → throws BulletinFetchError", async () => {
    await expect(
      runTaxBulletinDiff({
        jurisdiction: US_FEDERAL,
        cached: null,
        fetcher: fetcherReturning("server error", 503),
      }),
    ).rejects.toBeInstanceOf(BulletinFetchError);
  });

  it("empty response body → throws BulletinFetchError", async () => {
    await expect(
      runTaxBulletinDiff({
        jurisdiction: US_FEDERAL,
        cached: null,
        fetcher: fetcherReturning("   "),
      }),
    ).rejects.toBeInstanceOf(BulletinFetchError);
  });

  it("unsupported jurisdiction → throws UnsupportedJurisdictionError", async () => {
    await expect(
      runTaxBulletinDiff({
        jurisdiction: { country: "Atlantis", subdivision: null },
        cached: null,
        fetcher: fetcherReturning(BULLETIN_V1),
      }),
    ).rejects.toBeInstanceOf(UnsupportedJurisdictionError);
  });
});
