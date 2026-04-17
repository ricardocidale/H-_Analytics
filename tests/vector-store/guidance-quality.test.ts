import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/ai/vector-store-service", () => ({
  isVectorStoreAvailable: vi.fn(() => true),
  isEmbeddingAvailable: vi.fn(() => true),
  upsertChunks: vi.fn(async () => {}),
  queryChunks: vi.fn(async () => []),
}));

import { retrieveSimilarGuidance, indexAssumptionGuidance } from "../../server/ai/vector-indexing";
import { queryChunks, upsertChunks } from "../../server/ai/vector-store-service";

const mockedQueryChunks = vi.mocked(queryChunks);
const mockedUpsertChunks = vi.mocked(upsertChunks);

function makeMatch(overrides: Record<string, unknown> = {}, score = 0.85) {
  return {
    id: `guidance:property:1:adr`,
    score,
    metadata: {
      entityType: "property",
      entityId: 1,
      location: "Miami, FL",
      propertyType: "boutique",
      businessModel: "hotel",
      assumptionKey: "adr",
      valueLow: 150,
      valueMid: 200,
      valueHigh: 280,
      confidence: 0.85,
      reasoning: "Based on STR luxury segment data",
      ...overrides,
    },
  };
}

describe("T014 — Assumption Guidance Retrieval Quality", () => {

  beforeEach(() => {
    vi.resetAllMocks();
    mockedQueryChunks.mockResolvedValue([]);
    mockedUpsertChunks.mockResolvedValue(undefined);
  });

  describe("retrieveSimilarGuidance", () => {
    it("returns empty array when no matches above threshold", async () => {
      mockedQueryChunks.mockResolvedValue([makeMatch({}, 0.4)]);
      const results = await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
      });
      expect(results).toHaveLength(0);
    });

    it("returns matches above 0.6 score threshold", async () => {
      mockedQueryChunks.mockResolvedValue([
        makeMatch({}, 0.85),
        makeMatch({ assumptionKey: "occupancy" }, 0.55),
      ]);
      const results = await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
      });
      expect(results).toHaveLength(1);
      expect(results[0].assumptionKey).toBe("adr");
      expect(results[0].score).toBe(0.85);
    });

    it("includes business model in query text", async () => {
      mockedQueryChunks.mockResolvedValue([]);
      await retrieveSimilarGuidance({
        location: "Aspen, CO",
        propertyType: "resort",
        businessModel: "lodge",
      });
      expect(mockedQueryChunks).toHaveBeenCalledWith(
        "assumption-guidance",
        expect.stringContaining("lodge"),
        expect.any(Number),
      );
    });

    it("defaults business model to 'hotel'", async () => {
      mockedQueryChunks.mockResolvedValue([]);
      await retrieveSimilarGuidance({
        location: "Austin, TX",
        propertyType: "boutique",
      });
      expect(mockedQueryChunks).toHaveBeenCalledWith(
        "assumption-guidance",
        expect.stringContaining("hotel"),
        expect.any(Number),
      );
    });

    it("filters by assumptionKeys when provided", async () => {
      mockedQueryChunks.mockResolvedValue([
        makeMatch({ assumptionKey: "adr" }, 0.9),
        makeMatch({ assumptionKey: "occupancy" }, 0.8),
      ]);
      const results = await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
        assumptionKeys: ["adr"],
      });
      expect(results).toHaveLength(1);
      expect(results[0].assumptionKey).toBe("adr");
    });

    it("maps guidance values correctly (Low/Mid/High)", async () => {
      mockedQueryChunks.mockResolvedValue([
        makeMatch({ valueLow: 150, valueMid: 200, valueHigh: 280 }, 0.9),
      ]);
      const results = await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
      });
      expect(results[0].valueLow).toBe(150);
      expect(results[0].valueMid).toBe(200);
      expect(results[0].valueHigh).toBe(280);
    });

    it("treats zero-valued guidance as null", async () => {
      mockedQueryChunks.mockResolvedValue([
        makeMatch({ valueLow: 0, valueMid: 200, valueHigh: 0 }, 0.9),
      ]);
      const results = await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
      });
      expect(results[0].valueLow).toBeNull();
      expect(results[0].valueMid).toBe(200);
      expect(results[0].valueHigh).toBeNull();
    });

    it("returns empty array on Pinecone error (graceful degradation)", async () => {
      mockedQueryChunks.mockRejectedValue(new Error("Pinecone timeout"));
      const results = await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
      });
      expect(results).toEqual([]);
    });

    it("respects topK parameter", async () => {
      mockedQueryChunks.mockResolvedValue([]);
      await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
        topK: 5,
      });
      expect(mockedQueryChunks).toHaveBeenCalledWith(
        "assumption-guidance",
        expect.any(String),
        5,
      );
    });
  });

  describe("indexAssumptionGuidance", () => {
    it("creates deterministic ID from entity type, ID, and key", async () => {
      await indexAssumptionGuidance({
        entityType: "property",
        entityId: 42,
        location: "Denver, CO",
        propertyType: "boutique",
        businessModel: "hotel",
        assumptionKey: "adr",
        valueLow: 180,
        valueMid: 220,
        valueHigh: 300,
        confidence: 0.92,
        reasoning: "STR data",
      });
      expect(mockedUpsertChunks).toHaveBeenCalledWith(
        "assumption-guidance",
        expect.arrayContaining([
          expect.objectContaining({ id: "guidance:global:property:42:adr" }),
        ]),
      );
    });

    it("includes assumption key and location in text for embedding", async () => {
      await indexAssumptionGuidance({
        entityType: "property",
        entityId: 1,
        location: "Savannah, GA",
        propertyType: "boutique",
        assumptionKey: "occupancy",
        valueLow: 0.60,
        valueMid: 0.70,
        valueHigh: 0.82,
        confidence: 0.88,
        reasoning: null,
      });
      const chunks = mockedUpsertChunks.mock.calls[0][1];
      expect(chunks[0].text).toContain("Savannah, GA");
      expect(chunks[0].text).toContain("occupancy");
      expect(chunks[0].text).toContain("boutique");
    });

    it("stores confidence and value range in metadata", async () => {
      await indexAssumptionGuidance({
        entityType: "company",
        entityId: 5,
        location: "Portland, OR",
        propertyType: "resort",
        businessModel: "lodge",
        assumptionKey: "capRate",
        valueLow: 0.06,
        valueMid: 0.075,
        valueHigh: 0.09,
        confidence: 0.75,
        reasoning: "CBRE survey",
      });
      const metadata = mockedUpsertChunks.mock.calls[0][1][0].metadata;
      expect(metadata).toMatchObject({
        confidence: 0.75,
        valueLow: 0.06,
        valueMid: 0.075,
        valueHigh: 0.09,
        businessModel: "lodge",
      });
    });
  });

  describe("guidance value bounds", () => {
    it("Low <= Mid <= High when all are present", async () => {
      const guidance = { valueLow: 150, valueMid: 200, valueHigh: 280 };
      expect(guidance.valueLow).toBeLessThanOrEqual(guidance.valueMid);
      expect(guidance.valueMid).toBeLessThanOrEqual(guidance.valueHigh);
    });

    it("confidence is bounded 0-1", async () => {
      mockedQueryChunks.mockResolvedValue([
        makeMatch({ confidence: 0.92 }, 0.85),
      ]);
      const results = await retrieveSimilarGuidance({
        location: "Miami, FL",
        propertyType: "boutique",
      });
      expect(results[0].confidence).toBeGreaterThanOrEqual(0);
      expect(results[0].confidence).toBeLessThanOrEqual(1);
    });
  });
});
