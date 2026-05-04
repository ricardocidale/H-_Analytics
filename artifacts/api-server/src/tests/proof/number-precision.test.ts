import { describe, it, expect } from 'vitest';
import { stableHash, stableEquals } from '@server/scenarios/stable-json';
import { extractScenarioComputeInputs } from '@server/routes/scenario-helpers';

describe('Number Precision & stableHash (T004)', () => {
  it('stableHash({a:1}) === stableHash({a:1})', () => {
    expect(stableHash({ a: 1 })).toBe(stableHash({ a: 1 }));
  });

  it('stableHash({a:1, b:2}) === stableHash({b:2, a:1}) (key-order independence)', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it('stableHash({a:1}) !== stableHash({a:2})', () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it('stableHash returns a 64-char hex string', () => {
    const hash = stableHash({ test: true });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stableEquals({a:1,b:{c:2}}, {b:{c:2},a:1}) is true', () => {
    expect(stableEquals({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
  });

  it('stableEquals({a:1}, {a:2}) is false', () => {
    expect(stableEquals({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('stableEquals(null, null) is true', () => {
    expect(stableEquals(null, null)).toBe(true);
  });

  it('stableEquals(null, {}) is false', () => {
    expect(stableEquals(null, {})).toBe(false);
  });

  it('stableEquals with nested arrays', () => {
    expect(stableEquals([{ x: 1 }, { x: 2 }], [{ x: 1 }, { x: 2 }])).toBe(true);
  });

  it('High-precision decimals: stableHash({rate: 0.0875}) !== stableHash({rate: 0.0876})', () => {
    expect(stableHash({ rate: 0.0875 })).not.toBe(stableHash({ rate: 0.0876 }));
  });

  describe('extractScenarioComputeInputs', () => {
    it('verifies structure of extracted inputs', () => {
      const scenario = {
        globalAssumptions: {
          costOfEquity: 0.12,
          inflationRate: 0.03,
          projectionYears: 12
        },
        properties: [
          { name: 'Prop 1', purchasePrice: 1000000 }
        ]
      };
      const result = extractScenarioComputeInputs(scenario);
      
      expect(Array.isArray(result.propertyInputs)).toBe(true);
      expect(result.propertyInputs).toHaveLength(1);
      expect(result.propertyInputs[0].name).toBe('Prop 1');
      
      expect(result.globalInput).toBeDefined();
      expect(result.globalInput.inflationRate).toBe(0.03);
      expect(result.projYears).toBe(12);
      expect(result.projYears).toBeGreaterThan(0);
    });

    it('works with empty properties array', () => {
      const scenario = {
        globalAssumptions: { inflationRate: 0.03 },
        properties: []
      };
      const result = extractScenarioComputeInputs(scenario);
      expect(result.propertyInputs).toEqual([]);
    });

    it('minimal scenario fixture', () => {
      const scenario = {
        globalAssumptions: { costOfEquity: 0.12, inflationRate: 0.03 },
        properties: []
      };
      const result = extractScenarioComputeInputs(scenario);
      expect(result.globalInput.inflationRate).toBe(0.03);
      expect(result.propertyInputs).toHaveLength(0);
    });
  });
});
