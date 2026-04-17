import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/ai/vector-store-service", () => ({
  isVectorStoreAvailable: vi.fn(() => true),
  isEmbeddingAvailable: vi.fn(() => true),
  upsertChunks: vi.fn(async () => {}),
  queryChunks: vi.fn(async () => []),
}));

import { indexScenarioSummary } from "../../server/ai/vector-indexing";
import { upsertChunks, isVectorStoreAvailable } from "../../server/ai/vector-store-service";

const mockedUpsertChunks = vi.mocked(upsertChunks);
const mockedIsPineconeAvailable = vi.mocked(isVectorStoreAvailable);

const baseScenario = {
  scenarioId: 42,
  scenarioName: "Base Case — Grand Savannah",
  propertyId: 7,
  propertyName: "Grand Savannah Inn",
  location: "Savannah, GA",
  propertyType: "boutique",
  totalRevenue: 2_500_000,
  totalExpenses: 1_800_000,
  noi: 700_000,
  adr: 245,
  occupancy: 0.72,
  revpar: 176.4,
  years: 10,
  createdBy: "user@example.com",
};

describe("T015 — Scenario Indexing for Rebecca", () => {

  beforeEach(() => {
    vi.resetAllMocks();
    mockedIsPineconeAvailable.mockReturnValue(true);
    mockedUpsertChunks.mockResolvedValue(undefined);
  });

  describe("deterministic ID format", () => {
    it("uses scenario:{id} format", async () => {
      await indexScenarioSummary(baseScenario);
      expect(mockedUpsertChunks).toHaveBeenCalledWith(
        "scenarios",
        expect.arrayContaining([
          expect.objectContaining({ id: "scenario:42" }),
        ]),
      );
    });

    it("upsert-not-duplicate: same scenarioId overwrites previous vector", async () => {
      await indexScenarioSummary(baseScenario);
      await indexScenarioSummary({ ...baseScenario, scenarioName: "Updated Case" });
      const calls = mockedUpsertChunks.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][1][0].id).toBe("scenario:42");
      expect(calls[1][1][0].id).toBe("scenario:42");
    });
  });

  describe("text construction for embedding", () => {
    it("includes scenario name and property name", async () => {
      await indexScenarioSummary(baseScenario);
      const text = mockedUpsertChunks.mock.calls[0][1][0].text;
      expect(text).toContain("Base Case — Grand Savannah");
      expect(text).toContain("Grand Savannah Inn");
    });

    it("includes location and property type", async () => {
      await indexScenarioSummary(baseScenario);
      const text = mockedUpsertChunks.mock.calls[0][1][0].text;
      expect(text).toContain("Savannah, GA");
      expect(text).toContain("boutique");
    });

    it("includes projection years", async () => {
      await indexScenarioSummary(baseScenario);
      const text = mockedUpsertChunks.mock.calls[0][1][0].text;
      expect(text).toContain("10-year projection");
    });

    it("includes formatted revenue metrics", async () => {
      await indexScenarioSummary(baseScenario);
      const text = mockedUpsertChunks.mock.calls[0][1][0].text;
      expect(text).toContain("NOI:");
      expect(text).toContain("ADR:");
    });

    it("includes occupancy formatted as percentage", async () => {
      await indexScenarioSummary(baseScenario);
      const text = mockedUpsertChunks.mock.calls[0][1][0].text;
      expect(text).toContain("Occupancy: 72.0%");
    });

    it("includes hospitality domain keywords for semantic search", async () => {
      await indexScenarioSummary(baseScenario);
      const text = mockedUpsertChunks.mock.calls[0][1][0].text;
      expect(text).toContain("hospitality");
      expect(text).toContain("financial");
      expect(text).toContain("scenario");
    });
  });

  describe("KPI metadata extraction", () => {
    it("stores all numeric KPIs in metadata", async () => {
      await indexScenarioSummary(baseScenario);
      const metadata = mockedUpsertChunks.mock.calls[0][1][0].metadata;
      expect(metadata).toMatchObject({
        scenarioId: 42,
        propertyId: 7,
        totalRevenue: 2_500_000,
        totalExpenses: 1_800_000,
        noi: 700_000,
        adr: 245,
        occupancy: 0.72,
        revpar: 176.4,
        years: 10,
      });
    });

    it("defaults missing KPIs to 0", async () => {
      await indexScenarioSummary({
        scenarioId: 99,
        scenarioName: "Minimal",
        propertyId: 1,
        propertyName: "Test",
        location: "NYC",
        propertyType: "boutique",
      });
      const metadata = mockedUpsertChunks.mock.calls[0][1][0].metadata;
      expect(metadata.totalRevenue).toBe(0);
      expect(metadata.noi).toBe(0);
      expect(metadata.adr).toBe(0);
      expect(metadata.occupancy).toBe(0);
    });

    it("truncates long scenario names to 500 chars", async () => {
      const longName = "A".repeat(600);
      await indexScenarioSummary({ ...baseScenario, scenarioName: longName });
      const metadata = mockedUpsertChunks.mock.calls[0][1][0].metadata;
      expect(metadata.scenarioName).toHaveLength(500);
    });

    it("truncates long property names to 200 chars", async () => {
      const longName = "B".repeat(300);
      await indexScenarioSummary({ ...baseScenario, propertyName: longName });
      const metadata = mockedUpsertChunks.mock.calls[0][1][0].metadata;
      expect(metadata.propertyName).toHaveLength(200);
    });

    it("truncates createdBy to 100 chars", async () => {
      const longEmail = "x".repeat(150) + "@test.com";
      await indexScenarioSummary({ ...baseScenario, createdBy: longEmail });
      const metadata = mockedUpsertChunks.mock.calls[0][1][0].metadata;
      expect(metadata.createdBy.length).toBeLessThanOrEqual(100);
    });
  });

  describe("graceful degradation", () => {
    it("no-ops when Pinecone is unavailable", async () => {
      mockedIsPineconeAvailable.mockReturnValue(false);
      await indexScenarioSummary(baseScenario);
      expect(mockedUpsertChunks).not.toHaveBeenCalled();
    });

    it("does not throw on upsert failure", async () => {
      mockedUpsertChunks.mockRejectedValue(new Error("Network error"));
      await expect(indexScenarioSummary(baseScenario)).resolves.toBeUndefined();
    });
  });

  describe("namespace", () => {
    it("always writes to 'scenarios' namespace", async () => {
      await indexScenarioSummary(baseScenario);
      expect(mockedUpsertChunks).toHaveBeenCalledWith("scenarios", expect.any(Array));
    });
  });
});
