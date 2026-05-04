/**
 * T006 — Scenario Snapshot Integrity
 *
 * Verifies that stableHash and stableEquals behave deterministically across
 * JSON serialization, key-ordering, nesting, and high-precision numeric fields.
 * These properties are the foundation of the outputHash that pins engine results
 * to a specific set of inputs; any drift here silently breaks audit-trail integrity.
 */
import { describe, it, expect } from 'vitest';
import { stableHash, stableEquals, stableStringify } from '@server/scenarios/stable-json';

describe('Snapshot Integrity (T006)', () => {
  describe('stableHash determinism', () => {
    it('same object always produces the same hash', () => {
      const obj = { a: 1, b: 'hello', c: true };
      expect(stableHash(obj)).toBe(stableHash(obj));
      expect(stableHash(obj)).toBe(stableHash({ a: 1, b: 'hello', c: true }));
    });

    it('key order does not affect the hash', () => {
      const h1 = stableHash({ x: 1, y: 2, z: 3 });
      const h2 = stableHash({ z: 3, x: 1, y: 2 });
      const h3 = stableHash({ y: 2, z: 3, x: 1 });
      expect(h1).toBe(h2);
      expect(h2).toBe(h3);
    });

    it('nested key order does not affect the hash', () => {
      const h1 = stableHash({ outer: { a: 1, b: 2 }, c: 3 });
      const h2 = stableHash({ c: 3, outer: { b: 2, a: 1 } });
      expect(h1).toBe(h2);
    });

    it('different values produce different hashes', () => {
      expect(stableHash({ rate: 0.08 })).not.toBe(stableHash({ rate: 0.09 }));
      expect(stableHash({ n: 1 })).not.toBe(stableHash({ n: 2 }));
      expect(stableHash({ s: 'a' })).not.toBe(stableHash({ s: 'b' }));
    });

    it('high-precision decimals are distinguishable', () => {
      expect(stableHash({ rate: 0.0875 })).not.toBe(stableHash({ rate: 0.0876 }));
      expect(stableHash({ v: 1.000000001 })).not.toBe(stableHash({ v: 1.000000002 }));
    });

    it('null vs missing key produces different hashes', () => {
      expect(stableHash({ a: null })).not.toBe(stableHash({}));
      expect(stableHash({ a: undefined })).not.toBe(stableHash({ a: null }));
    });

    it('array order matters (unlike object key order)', () => {
      expect(stableHash([1, 2, 3])).not.toBe(stableHash([3, 2, 1]));
    });

    it('empty object and empty array are different', () => {
      expect(stableHash({})).not.toBe(stableHash([]));
    });

    it('returns a 64-character lowercase hex string', () => {
      const h = stableHash({ any: 'value' });
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });

    it('null payload produces a stable hash (does not throw)', () => {
      const h = stableHash(null);
      expect(h).toMatch(/^[a-f0-9]{64}$/);
      expect(h).toBe(stableHash(null));
    });
  });

  describe('stableEquals deep equality', () => {
    it('identical primitives are equal', () => {
      expect(stableEquals(1, 1)).toBe(true);
      expect(stableEquals('hello', 'hello')).toBe(true);
      expect(stableEquals(true, true)).toBe(true);
      expect(stableEquals(null, null)).toBe(true);
    });

    it('different primitives are not equal', () => {
      expect(stableEquals(1, 2)).toBe(false);
      expect(stableEquals('a', 'b')).toBe(false);
      expect(stableEquals(null, undefined)).toBe(false);
    });

    it('deep-equal objects are equal regardless of key order', () => {
      expect(stableEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
      expect(stableEquals({ x: { y: 1 } }, { x: { y: 1 } })).toBe(true);
    });

    it('objects with different values are not equal', () => {
      expect(stableEquals({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('arrays are equal when contents and order match', () => {
      expect(stableEquals([1, 2, 3], [1, 2, 3])).toBe(true);
    });

    it('arrays are not equal when order differs', () => {
      expect(stableEquals([1, 2, 3], [3, 2, 1])).toBe(false);
    });

    it('nested arrays with objects are compared correctly', () => {
      expect(stableEquals([{ x: 1 }, { x: 2 }], [{ x: 1 }, { x: 2 }])).toBe(true);
      expect(stableEquals([{ x: 1 }, { x: 2 }], [{ x: 2 }, { x: 1 }])).toBe(false);
    });
  });

  describe('stableStringify canonical form', () => {
    it('produces sorted keys', () => {
      const s = stableStringify({ z: 3, a: 1, m: 2 });
      expect(s).toBe('{"a":1,"m":2,"z":3}');
    });

    it('is consistent on re-call', () => {
      const obj = { purchasePrice: 2_500_000, inflationRate: 0.0325 };
      expect(stableStringify(obj)).toBe(stableStringify(obj));
    });
  });

  describe('outputHash round-trip scenario', () => {
    it('two identical compute input objects produce the same outputHash', () => {
      const input = {
        properties: [{ id: 1, roomCount: 20, startAdr: 150 }],
        globalAssumptions: { inflationRate: 0.03, projectionYears: 10 },
      };
      const inputCopy = JSON.parse(JSON.stringify(input));
      expect(stableHash(input)).toBe(stableHash(inputCopy));
    });

    it('changing one numeric field changes the outputHash', () => {
      const base = { properties: [{ roomCount: 20 }], inflationRate: 0.03 };
      const changed = { properties: [{ roomCount: 21 }], inflationRate: 0.03 };
      expect(stableHash(base)).not.toBe(stableHash(changed));
    });

    it('JSONB round-trip preserves numeric precision', () => {
      const original = { rate: 0.0875, price: 2_500_000, threshold: 1e-9 };
      const serialized = JSON.parse(JSON.stringify(original));
      expect(stableHash(original)).toBe(stableHash(serialized));
      expect(stableEquals(original, serialized)).toBe(true);
    });
  });
});
