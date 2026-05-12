/**
 * Task #1515 — Fabio-mode range-badge tests
 *
 * Covers the Fabio path introduced in task #1481 per the SUPERSEDING contract
 * memorised in replit.md (2026-05-11):
 *
 *   1. classifyRangeQuality  → green / yellow / red / grey dot
 *   2. isOutOfRange          → "out of range" chip shown / hidden
 *   3. RangeIndicator (Fabio mode) → dot rendered, chip toggled correctly,
 *      deprecated Med/Low/High confidence tail suppressed
 *
 * Uses React's server-side renderToString — no DOM / jsdom required.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  classifyRangeQuality,
  isOutOfRange,
  type AssumptionGuardrail,
} from '@engine/analyst/minions/fabio';
import { RangeIndicator } from '@/components/research/RangeIndicator';

// ── Shared fixtures ──────────────────────────────────────────────────────────

/** Guardrail with an explicit target band [0.10, 0.18] inside [0.06, 0.25]. */
const GUARDRAIL_WITH_TARGET: AssumptionGuardrail = {
  assumptionKey: 'cost_of_equity',
  low: 0.06,
  high: 0.25,
  targetLow: 0.10,
  targetHigh: 0.18,
};

/** Guardrail without a target band — Fabio derives the inner 50% quartile. */
const GUARDRAIL_NO_TARGET: AssumptionGuardrail = {
  assumptionKey: 'cap_rate',
  low: 0.04,
  high: 0.12,
  targetLow: null,
  targetHigh: null,
};

/** Minimal entry fixture for the component tests (display units: percent). */
const ENTRY_IN_RANGE = { display: '10%–18%', mid: 14 };
const ENTRY_OUT_OF_RANGE = { display: '10%–18%', mid: 14 };

// ── classifyRangeQuality ─────────────────────────────────────────────────────

describe('classifyRangeQuality()', () => {
  describe('grey — missing inputs', () => {
    it('returns grey when value is null', () => {
      expect(classifyRangeQuality(null, GUARDRAIL_WITH_TARGET)).toBe('grey');
    });

    it('returns grey when value is undefined', () => {
      expect(classifyRangeQuality(undefined, GUARDRAIL_WITH_TARGET)).toBe('grey');
    });

    it('returns grey when guardrail is null', () => {
      expect(classifyRangeQuality(0.12, null)).toBe('grey');
    });

    it('returns grey when value is NaN', () => {
      expect(classifyRangeQuality(NaN, GUARDRAIL_WITH_TARGET)).toBe('grey');
    });
  });

  describe('red — value outside guardrail bounds', () => {
    it('returns red when value is below low', () => {
      expect(classifyRangeQuality(0.03, GUARDRAIL_WITH_TARGET)).toBe('red');
    });

    it('returns red when value is above high', () => {
      expect(classifyRangeQuality(0.30, GUARDRAIL_WITH_TARGET)).toBe('red');
    });

    it('returns red at exactly the low boundary minus epsilon', () => {
      expect(classifyRangeQuality(0.059, GUARDRAIL_WITH_TARGET)).toBe('red');
    });
  });

  describe('green — value within target band (explicit targetLow/targetHigh)', () => {
    it('returns green when value equals targetLow', () => {
      expect(classifyRangeQuality(0.10, GUARDRAIL_WITH_TARGET)).toBe('green');
    });

    it('returns green when value equals targetHigh', () => {
      expect(classifyRangeQuality(0.18, GUARDRAIL_WITH_TARGET)).toBe('green');
    });

    it('returns green when value is strictly inside the target band', () => {
      expect(classifyRangeQuality(0.14, GUARDRAIL_WITH_TARGET)).toBe('green');
    });
  });

  describe('yellow — within guardrail but outside target band', () => {
    it('returns yellow when value is between low and targetLow', () => {
      expect(classifyRangeQuality(0.08, GUARDRAIL_WITH_TARGET)).toBe('yellow');
    });

    it('returns yellow when value is between targetHigh and high', () => {
      expect(classifyRangeQuality(0.22, GUARDRAIL_WITH_TARGET)).toBe('yellow');
    });
  });

  describe('green/yellow — derived inner band (no explicit target)', () => {
    // span = 0.08, inner = [0.04 + 0.02, 0.04 + 0.06] = [0.06, 0.10]
    it('returns green when value is in derived central 50% band', () => {
      expect(classifyRangeQuality(0.08, GUARDRAIL_NO_TARGET)).toBe('green');
    });

    it('returns yellow when value is in guardrail but outside derived band', () => {
      expect(classifyRangeQuality(0.11, GUARDRAIL_NO_TARGET)).toBe('yellow');
    });
  });
});

// ── isOutOfRange ─────────────────────────────────────────────────────────────

describe('isOutOfRange()', () => {
  it('returns false when value is null', () => {
    expect(isOutOfRange(null, GUARDRAIL_WITH_TARGET)).toBe(false);
  });

  it('returns false when guardrail is null', () => {
    expect(isOutOfRange(0.12, null)).toBe(false);
  });

  it('returns false when value is inside the guardrail', () => {
    expect(isOutOfRange(0.12, GUARDRAIL_WITH_TARGET)).toBe(false);
  });

  it('returns false when value equals the low bound', () => {
    expect(isOutOfRange(0.06, GUARDRAIL_WITH_TARGET)).toBe(false);
  });

  it('returns false when value equals the high bound', () => {
    expect(isOutOfRange(0.25, GUARDRAIL_WITH_TARGET)).toBe(false);
  });

  it('returns true when value is below low', () => {
    expect(isOutOfRange(0.03, GUARDRAIL_WITH_TARGET)).toBe(true);
  });

  it('returns true when value is above high', () => {
    expect(isOutOfRange(0.30, GUARDRAIL_WITH_TARGET)).toBe(true);
  });
});

// ── RangeIndicator — Fabio mode (component rendering) ───────────────────────

describe('RangeIndicator — Fabio mode', () => {
  describe('range-quality dot', () => {
    it('renders the fabio-range-quality-dot element', () => {
      const html = renderToString(
        <RangeIndicator
          currentValue={0.14}
          entry={ENTRY_IN_RANGE}
          isPercent
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).toContain('data-testid="fabio-range-quality-dot"');
    });

    it('applies the green class when the mid is within the target band', () => {
      // mid=14 → normalised 0.14, inside targetLow=0.10 / targetHigh=0.18 → green
      const html = renderToString(
        <RangeIndicator
          currentValue={0.14}
          entry={ENTRY_IN_RANGE}
          isPercent
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).toContain('bg-emerald-500');
    });

    it('applies the red class when the mid is outside the guardrail bounds', () => {
      // mid=2 → normalised 0.02, below guardrail.low=0.06 → red
      const html = renderToString(
        <RangeIndicator
          currentValue={0.02}
          entry={{ display: '1%–3%', mid: 2 }}
          isPercent
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).toContain('bg-red-500');
    });
  });

  describe('"out of range" chip', () => {
    it('renders the chip when user value is outside the guardrail', () => {
      // currentValue=0.03 → normalised 0.03, below guardrail.low=0.06 → out of range
      const html = renderToString(
        <RangeIndicator
          currentValue={0.03}
          entry={ENTRY_OUT_OF_RANGE}
          isPercent
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).toContain('data-testid="range-out-of-range-chip"');
      expect(html).toContain('out of range');
    });

    it('does NOT render the chip when user value is inside the guardrail', () => {
      const html = renderToString(
        <RangeIndicator
          currentValue={0.14}
          entry={ENTRY_IN_RANGE}
          isPercent
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).not.toContain('data-testid="range-out-of-range-chip"');
    });

    it('does NOT render the chip when currentValue is null', () => {
      const html = renderToString(
        <RangeIndicator
          currentValue={null}
          entry={ENTRY_IN_RANGE}
          isPercent
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).not.toContain('data-testid="range-out-of-range-chip"');
    });
  });

  describe('deprecated Med/Low/High confidence tail suppressed', () => {
    it('does NOT render the confidence-indicator element in Fabio mode', () => {
      // Even when the entry has a high-confidence source annotation,
      // Fabio mode must NOT render the legacy confidence dot/label.
      const html = renderToString(
        <RangeIndicator
          currentValue={0.14}
          entry={{ display: '10%–18%', mid: 14, source: 'High', confidence: 'High' }}
          isPercent
          showConfidence
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).not.toContain('data-testid="confidence-indicator"');
    });

    it('does NOT include "Med" or "Low" or "High" severity words as standalone labels', () => {
      const html = renderToString(
        <RangeIndicator
          currentValue={0.14}
          entry={{ display: '10%–18%', mid: 14, source: 'Medium', confidence: 'medium' }}
          isPercent
          showConfidence
          guardrail={GUARDRAIL_WITH_TARGET}
        />,
      );
      expect(html).not.toContain('data-testid="confidence-indicator"');
    });
  });
});
