import { describe, expect, it } from 'vitest';
import {
  hasRenovationHypothesis,
  resolveAsImprovedFacts,
  resolveAsPurchasedFacts,
  resolvePropertyFactsForYear,
} from './renovation-facts';

const PURCHASED = {
  description: 'Tired roadside motor inn — 24 keys.',
  fbVenues: 1,
  fbSeats: 30,
  eventSpaceSqft: 0,
  totalBuildingSqft: 9000,
};

const IMPROVED = {
  fbVenuesImproved: 2,
  fbSeatsImproved: 90,
  eventSpaceSqftImproved: 1200,
  totalBuildingSqftImproved: 12500,
  plannedReopeningYear: 2027,
  descriptionImproved: 'Reborn boutique lodge with chef-driven tavern and barn event hall.',
};

describe('renovation-facts', () => {
  it('returns As-Purchased before the planned reopening year', () => {
    const facts = resolvePropertyFactsForYear({ ...PURCHASED, ...IMPROVED }, 2026);
    expect(facts.state).toBe('as_purchased');
    expect(facts.fbVenues).toBe(1);
    expect(facts.totalBuildingSqft).toBe(9000);
    expect(facts.description).toBe(PURCHASED.description);
  });

  it('returns As-Improved from the planned reopening year onward', () => {
    const facts = resolvePropertyFactsForYear({ ...PURCHASED, ...IMPROVED }, 2027);
    expect(facts.state).toBe('as_improved');
    expect(facts.fbVenues).toBe(2);
    expect(facts.fbSeats).toBe(90);
    expect(facts.eventSpaceSqft).toBe(1200);
    expect(facts.totalBuildingSqft).toBe(12500);
    expect(facts.description).toBe(IMPROVED.descriptionImproved);
  });

  it('falls back per-field to As-Purchased when an improved value is null', () => {
    const partial = {
      ...PURCHASED,
      plannedReopeningYear: 2027,
      fbVenuesImproved: 3,
      // fbSeatsImproved deliberately omitted
      eventSpaceSqftImproved: null,
      descriptionImproved: null,
    };
    const facts = resolveAsImprovedFacts(partial);
    expect(facts.fbVenues).toBe(3);
    expect(facts.fbSeats).toBe(PURCHASED.fbSeats);
    expect(facts.eventSpaceSqft).toBe(PURCHASED.eventSpaceSqft);
    expect(facts.description).toBe(PURCHASED.description);
  });

  it('keeps As-Purchased when no plannedReopeningYear is set', () => {
    const facts = resolvePropertyFactsForYear({ ...PURCHASED, ...IMPROVED, plannedReopeningYear: null }, 2099);
    expect(facts.state).toBe('as_purchased');
    expect(facts.fbVenues).toBe(1);
  });

  it('detects whether any renovation hypothesis has been captured', () => {
    expect(hasRenovationHypothesis(PURCHASED)).toBe(false);
    expect(hasRenovationHypothesis({ ...PURCHASED, plannedReopeningYear: 2030 })).toBe(true);
    expect(hasRenovationHypothesis({ ...PURCHASED, descriptionImproved: 'rebuild' })).toBe(true);
  });

  it('resolveAsPurchasedFacts prefers descriptionPurchased over legacy description', () => {
    const facts = resolveAsPurchasedFacts({
      ...PURCHASED,
      descriptionPurchased: 'Explicit acquisition narrative.',
    });
    expect(facts.description).toBe('Explicit acquisition narrative.');
  });

  // ─── Plan 2026-05-13-002 U7 regression — JSONB-blob reads via the accessor ──
  //
  // After the engine reader migration, descriptor reads flow through
  // `property-descriptor-accessor`. The accessor prefers JSONB blob entries
  // (`descriptors_purchased` / `descriptors_improved`) over the typed-column
  // dual-write fallback. These tests verify both halves of that priority
  // chain so a future U8 typed-column drop is observable as a regression here.
  //
  // Test-fixture constants (CLAUDE.md §1 — no inline numeric literals).
  // Values are arbitrary fixture data chosen to be visually distinct between
  // purchased / improved / typed-column sources so the priority chain is
  // observable in failures.
  const AP_BLOB_FB_VENUES        = 4;
  const AP_BLOB_FB_SEATS         = 120;
  const AP_BLOB_EVENT_SQFT       = 1500;
  const AP_BLOB_TOTAL_BUILDING   = 14000;

  const AP_TYPED_FB_VENUES       = 1;
  const AP_BLOB_OVERRIDE_VENUES  = 7;

  const AI_PURCHASED_FB_VENUES   = 2;
  const AI_PURCHASED_FB_SEATS    = 50;
  const AI_PURCHASED_EVENT_SQFT  = 0;
  const AI_PURCHASED_TOTAL       = 10000;
  const AI_IMPROVED_FB_VENUES    = 6;
  const AI_IMPROVED_TOTAL        = 13500;

  const HYP_IMPROVED_FB_VENUES   = 5;
  const HYP_IMPROVED_REOPEN_YEAR = 2030;

  const REOPEN_YEAR              = 2028;
  const YEAR_BEFORE_REOPEN       = 2027;
  const REOPEN_FB_VENUES         = 5;

  it('reads As-Purchased values from descriptors_purchased JSONB blob', () => {
    const facts = resolveAsPurchasedFacts({
      // Typed columns deliberately left blank — values come from the blob only.
      descriptorsPurchased: {
        fbVenues: AP_BLOB_FB_VENUES,
        fbSeats: AP_BLOB_FB_SEATS,
        eventSpaceSqft: AP_BLOB_EVENT_SQFT,
        totalBuildingSqft: AP_BLOB_TOTAL_BUILDING,
        description: 'Blob-sourced acquisition narrative.',
      },
    });
    expect(facts.state).toBe('as_purchased');
    expect(facts.fbVenues).toBe(AP_BLOB_FB_VENUES);
    expect(facts.fbSeats).toBe(AP_BLOB_FB_SEATS);
    expect(facts.eventSpaceSqft).toBe(AP_BLOB_EVENT_SQFT);
    expect(facts.totalBuildingSqft).toBe(AP_BLOB_TOTAL_BUILDING);
    expect(facts.description).toBe('Blob-sourced acquisition narrative.');
  });

  it('prefers descriptors_purchased blob over typed-purchased column when both are set', () => {
    const facts = resolveAsPurchasedFacts({
      fbVenues: AP_TYPED_FB_VENUES,
      descriptionPurchased: 'Typed-column narrative.',
      descriptorsPurchased: {
        fbVenues: AP_BLOB_OVERRIDE_VENUES,
        description: 'Blob narrative wins.',
      },
    });
    expect(facts.fbVenues).toBe(AP_BLOB_OVERRIDE_VENUES);
    expect(facts.description).toBe('Blob narrative wins.');
  });

  it('reads As-Improved values from descriptors_improved JSONB blob, falling back to purchased blob', () => {
    const facts = resolveAsImprovedFacts({
      descriptorsPurchased: {
        fbVenues: AI_PURCHASED_FB_VENUES,
        fbSeats: AI_PURCHASED_FB_SEATS,
        eventSpaceSqft: AI_PURCHASED_EVENT_SQFT,
        totalBuildingSqft: AI_PURCHASED_TOTAL,
        description: 'Purchased narrative.',
      },
      descriptorsImproved: {
        fbVenues: AI_IMPROVED_FB_VENUES,
        // fbSeats deliberately omitted → falls back to purchased blob
        eventSpaceSqft: null, // explicit null also falls back
        totalBuildingSqft: AI_IMPROVED_TOTAL,
        description: 'Improved narrative.',
      },
    });
    expect(facts.state).toBe('as_improved');
    expect(facts.fbVenues).toBe(AI_IMPROVED_FB_VENUES);
    expect(facts.fbSeats).toBe(AI_PURCHASED_FB_SEATS);
    expect(facts.eventSpaceSqft).toBe(AI_PURCHASED_EVENT_SQFT);
    expect(facts.totalBuildingSqft).toBe(AI_IMPROVED_TOTAL);
    expect(facts.description).toBe('Improved narrative.');
  });

  it('hasRenovationHypothesis is true when descriptors_improved blob populates any field', () => {
    expect(
      hasRenovationHypothesis({
        ...PURCHASED,
        descriptorsImproved: { fbVenues: HYP_IMPROVED_FB_VENUES },
      }),
    ).toBe(true);
    expect(
      hasRenovationHypothesis({
        ...PURCHASED,
        descriptorsImproved: { plannedReopeningYear: HYP_IMPROVED_REOPEN_YEAR },
      }),
    ).toBe(true);
    // Empty improved blob should be treated as "no hypothesis captured".
    expect(
      hasRenovationHypothesis({
        ...PURCHASED,
        descriptorsImproved: {},
      }),
    ).toBe(false);
  });

  it('resolvePropertyFactsForYear honours plannedReopeningYear in descriptors_improved blob', () => {
    const property = {
      ...PURCHASED,
      // No typed `plannedReopeningYear` — only the blob.
      descriptorsImproved: {
        plannedReopeningYear: REOPEN_YEAR,
        fbVenues: REOPEN_FB_VENUES,
      },
    };
    expect(resolvePropertyFactsForYear(property, YEAR_BEFORE_REOPEN).state).toBe('as_purchased');
    expect(resolvePropertyFactsForYear(property, REOPEN_YEAR).state).toBe('as_improved');
    expect(resolvePropertyFactsForYear(property, REOPEN_YEAR).fbVenues).toBe(REOPEN_FB_VENUES);
  });
});
