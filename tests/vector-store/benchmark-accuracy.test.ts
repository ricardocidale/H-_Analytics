import { describe, it, expect } from "vitest";
import { mapCategoryToKpis, computeBenchmarkFreshness } from "../../server/ai/vector-indexing";

const ALL_BENCHMARK_CATEGORIES = [
  { key: "us_hotel_avg_adr_2024",       category: "hospitality_adr",       value: 157.95, expectedField: "adr" },
  { key: "us_hotel_avg_occ_2024",       category: "hospitality_occupancy", value: 63.0,   expectedField: "occupancy" },
  { key: "us_hotel_avg_revpar_2024",    category: "hospitality_revpar",    value: 99.51,  expectedField: "revpar" },
  { key: "us_luxury_avg_adr_2024",      category: "hospitality_adr",       value: 396.40, expectedField: "adr" },
  { key: "us_luxury_avg_occ_2024",      category: "hospitality_occupancy", value: 68.2,   expectedField: "occupancy" },
  { key: "us_boutique_avg_adr_2024",    category: "hospitality_adr",       value: 245.00, expectedField: "adr" },
  { key: "us_boutique_avg_occ_2024",    category: "hospitality_occupancy", value: 70.5,   expectedField: "occupancy" },
  { key: "us_hotel_cap_rate_2024",      category: "cap_rates",             value: 7.8,    expectedField: "capRate" },
  { key: "us_luxury_cap_rate_2024",     category: "cap_rates",             value: 6.2,    expectedField: "capRate" },
  { key: "us_resort_cap_rate_2024",     category: "cap_rates",             value: 7.0,    expectedField: "capRate" },
  { key: "us_ffe_reserve_rate",         category: "cost_rates",            value: 4.0,    expectedField: null },
  { key: "us_mgmt_fee_base_rate",       category: "fee_rates",             value: 3.0,    expectedField: null },
  { key: "us_mgmt_fee_incentive_rate",  category: "fee_rates",             value: 10.0,   expectedField: null },
  { key: "us_property_insurance_rate",  category: "cost_rates",            value: 1.2,    expectedField: null },
  { key: "us_property_tax_rate",        category: "cost_rates",            value: 2.5,    expectedField: null },
  { key: "depreciation_years_us",       category: "depreciation",          value: 39,     expectedField: null },
  { key: "depreciation_years_colombia", category: "depreciation",          value: 20,     expectedField: null },
  { key: "depreciation_years_canada",   category: "depreciation",          value: 25,     expectedField: null },
  { key: "depreciation_years_france",   category: "depreciation",          value: 25,     expectedField: null },
  { key: "depreciation_years_spain",    category: "depreciation",          value: 50,     expectedField: null },
  { key: "cost_seg_acceleration_pct",   category: "depreciation",          value: 30,     expectedField: null },
];

const KPI_FIELDS = ["adr", "occupancy", "capRate", "revpar"] as const;

describe("T013 — Benchmark Snapshot Accuracy", () => {

  describe("mapCategoryToKpis", () => {
    it("maps hospitality_adr → adr field", () => {
      const kpis = mapCategoryToKpis("hospitality_adr", 157.95);
      expect(kpis.adr).toBe(157.95);
      expect(kpis.occupancy).toBeNull();
      expect(kpis.capRate).toBeNull();
      expect(kpis.revpar).toBeNull();
    });

    it("maps hospitality_occupancy → occupancy field", () => {
      const kpis = mapCategoryToKpis("hospitality_occupancy", 63.0);
      expect(kpis.occupancy).toBe(63.0);
      expect(kpis.adr).toBeNull();
    });

    it("maps hospitality_revpar → revpar field", () => {
      const kpis = mapCategoryToKpis("hospitality_revpar", 99.51);
      expect(kpis.revpar).toBe(99.51);
      expect(kpis.adr).toBeNull();
    });

    it("maps cap_rates → capRate field", () => {
      const kpis = mapCategoryToKpis("cap_rates", 7.8);
      expect(kpis.capRate).toBe(7.8);
      expect(kpis.adr).toBeNull();
    });

    it("maps cost_rates to no KPI fields (null across the board)", () => {
      const kpis = mapCategoryToKpis("cost_rates", 4.0);
      expect(kpis.adr).toBeNull();
      expect(kpis.occupancy).toBeNull();
      expect(kpis.capRate).toBeNull();
      expect(kpis.revpar).toBeNull();
    });

    it("maps fee_rates to no KPI fields", () => {
      const kpis = mapCategoryToKpis("fee_rates", 3.0);
      for (const field of KPI_FIELDS) {
        expect(kpis[field]).toBeNull();
      }
    });

    it("maps depreciation to no KPI fields", () => {
      const kpis = mapCategoryToKpis("depreciation", 39);
      for (const field of KPI_FIELDS) {
        expect(kpis[field]).toBeNull();
      }
    });

    it("is case-insensitive", () => {
      const kpis = mapCategoryToKpis("HOSPITALITY_ADR", 200);
      expect(kpis.adr).toBe(200);
    });

    it("preserves null value for matched categories (null ≠ zero)", () => {
      const kpis = mapCategoryToKpis("hospitality_adr", null);
      expect(kpis.adr).toBeNull();
    });

    it("preserves zero value for matched categories (zero is valid)", () => {
      const kpis = mapCategoryToKpis("hospitality_adr", 0);
      expect(kpis.adr).toBe(0);
    });

    it("returns all nulls for unknown category (no silent false positive)", () => {
      const kpis = mapCategoryToKpis("some_new_unknown_category", 42);
      for (const field of KPI_FIELDS) {
        expect(kpis[field]).toBeNull();
      }
    });

    it("returns all nulls for non-KPI category with null value", () => {
      const kpis = mapCategoryToKpis("depreciation", null);
      for (const field of KPI_FIELDS) {
        expect(kpis[field]).toBeNull();
      }
    });
  });

  describe("all 21 benchmark categories map correctly", () => {
    for (const bench of ALL_BENCHMARK_CATEGORIES) {
      it(`${bench.key} (${bench.category}) → ${bench.expectedField ?? "none"}`, () => {
        const kpis = mapCategoryToKpis(bench.category, bench.value);

        if (bench.expectedField) {
          expect(kpis[bench.expectedField as keyof typeof kpis]).toBe(bench.value);
          for (const other of KPI_FIELDS) {
            if (other !== bench.expectedField) {
              expect(kpis[other]).toBeNull();
            }
          }
        } else {
          for (const field of KPI_FIELDS) {
            expect(kpis[field]).toBeNull();
          }
        }
      });
    }
  });

  describe("benchmark value integrity", () => {
    it("contains exactly 21 static hospitality benchmarks", () => {
      expect(ALL_BENCHMARK_CATEGORIES).toHaveLength(21);
    });

    it("ADR benchmarks are in reasonable USD range ($100-$500)", () => {
      const adrBenchmarks = ALL_BENCHMARK_CATEGORIES.filter(b => b.expectedField === "adr");
      expect(adrBenchmarks.length).toBeGreaterThanOrEqual(3);
      for (const b of adrBenchmarks) {
        expect(b.value).toBeGreaterThanOrEqual(100);
        expect(b.value).toBeLessThanOrEqual(500);
      }
    });

    it("occupancy benchmarks are in percentage range (0-100)", () => {
      const occBenchmarks = ALL_BENCHMARK_CATEGORIES.filter(b => b.expectedField === "occupancy");
      expect(occBenchmarks.length).toBeGreaterThanOrEqual(2);
      for (const b of occBenchmarks) {
        expect(b.value).toBeGreaterThan(0);
        expect(b.value).toBeLessThanOrEqual(100);
      }
    });

    it("cap rate benchmarks are in reasonable range (3-15%)", () => {
      const capBenchmarks = ALL_BENCHMARK_CATEGORIES.filter(b => b.expectedField === "capRate");
      expect(capBenchmarks.length).toBeGreaterThanOrEqual(3);
      for (const b of capBenchmarks) {
        expect(b.value).toBeGreaterThanOrEqual(3);
        expect(b.value).toBeLessThanOrEqual(15);
      }
    });

    it("depreciation years are in plausible range (15-50)", () => {
      const depreciation = ALL_BENCHMARK_CATEGORIES.filter(b => b.category === "depreciation" && b.key.includes("years"));
      for (const b of depreciation) {
        expect(b.value).toBeGreaterThanOrEqual(15);
        expect(b.value).toBeLessThanOrEqual(50);
      }
    });
  });

  describe("freshness policy (computeBenchmarkFreshness)", () => {
    it("marks benchmarks fetched within 90 days as fresh", () => {
      const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      expect(computeBenchmarkFreshness(recent)).toBe("fresh");
    });

    it("marks benchmarks older than 90 days as stale", () => {
      const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
      expect(computeBenchmarkFreshness(old)).toBe("stale");
    });

    it("marks benchmarks exactly at 90 days as fresh (boundary)", () => {
      const boundary = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      expect(computeBenchmarkFreshness(boundary)).toBe("fresh");
    });

    it("accepts ISO string dates", () => {
      const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeBenchmarkFreshness(recent)).toBe("fresh");
    });

    it("marks very old benchmarks as stale", () => {
      expect(computeBenchmarkFreshness("2020-01-01T00:00:00Z")).toBe("stale");
    });

    it("marks just-fetched benchmarks as fresh", () => {
      expect(computeBenchmarkFreshness(new Date())).toBe("fresh");
    });
  });
});
