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
});
