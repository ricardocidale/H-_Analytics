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

  it('reads As-Purchased values from descriptors_purchased JSONB blob', () => {
    const facts = resolveAsPurchasedFacts({
      // Typed columns deliberately left blank — values come from the blob only.
      descriptorsPurchased: {
        fbVenues: 4,
        fbSeats: 120,
        eventSpaceSqft: 1500,
        totalBuildingSqft: 14000,
        description: 'Blob-sourced acquisition narrative.',
      },
    });
    expect(facts.state).toBe('as_purchased');
    expect(facts.fbVenues).toBe(4);
    expect(facts.fbSeats).toBe(120);
    expect(facts.eventSpaceSqft).toBe(1500);
    expect(facts.totalBuildingSqft).toBe(14000);
    expect(facts.description).toBe('Blob-sourced acquisition narrative.');
  });

  it('prefers descriptors_purchased blob over typed-purchased column when both are set', () => {
    const facts = resolveAsPurchasedFacts({
      fbVenues: 1,
      descriptionPurchased: 'Typed-column narrative.',
      descriptorsPurchased: {
        fbVenues: 7,
        description: 'Blob narrative wins.',
      },
    });
    expect(facts.fbVenues).toBe(7);
    expect(facts.description).toBe('Blob narrative wins.');
  });

  it('reads As-Improved values from descriptors_improved JSONB blob, falling back to purchased blob', () => {
    const facts = resolveAsImprovedFacts({
      descriptorsPurchased: {
        fbVenues: 2,
        fbSeats: 50,
        eventSpaceSqft: 0,
        totalBuildingSqft: 10000,
        description: 'Purchased narrative.',
      },
      descriptorsImproved: {
        fbVenues: 6,
        // fbSeats deliberately omitted → falls back to purchased blob
        eventSpaceSqft: null, // explicit null also falls back
        totalBuildingSqft: 13500,
        description: 'Improved narrative.',
      },
    });
    expect(facts.state).toBe('as_improved');
    expect(facts.fbVenues).toBe(6);
    expect(facts.fbSeats).toBe(50);
    expect(facts.eventSpaceSqft).toBe(0);
    expect(facts.totalBuildingSqft).toBe(13500);
    expect(facts.description).toBe('Improved narrative.');
  });

  it('hasRenovationHypothesis is true when descriptors_improved blob populates any field', () => {
    expect(
      hasRenovationHypothesis({
        ...PURCHASED,
        descriptorsImproved: { fbVenues: 5 },
      }),
    ).toBe(true);
    expect(
      hasRenovationHypothesis({
        ...PURCHASED,
        descriptorsImproved: { plannedReopeningYear: 2030 },
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
        plannedReopeningYear: 2028,
        fbVenues: 5,
      },
    };
    expect(resolvePropertyFactsForYear(property, 2027).state).toBe('as_purchased');
    expect(resolvePropertyFactsForYear(property, 2028).state).toBe('as_improved');
    expect(resolvePropertyFactsForYear(property, 2028).fbVenues).toBe(5);
  });
});
