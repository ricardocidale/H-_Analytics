import { createHash } from "node:crypto";
import type { Request } from "express";
import { storage } from "../../storage";
import { getAuthUser } from "../../auth";
import { extractGuidance } from "../../ai/guidance/extractor";
import { indexAssumptionGuidance } from "../../ai/vector-store-service";
import { logger } from "../../logger";
import { ENGINE_VERSION } from "../../ai/engine-version";
import {
  computeCacheKey,
  computeInputContextHash,
  canonicalJson,
  type PropertyCacheInputs,
  type CompanyCacheInputs,
} from "@engine/analyst/cognitive/cache-keys";
import type { CanonicalResearchField } from "../../ai/synthesis-schema";
import type { GlobalAssumptions } from "@workspace/db";
import type { ResearchParams } from "../../ai/research-prompt-builders";

/** Stable default persona sentinel — same sentinel used by analyst-scoped-runner.ts. */
const PERSONA_HASH = createHash("sha256")
  .update(canonicalJson({ style: "L+B", tier: "luxury", market: "US" }))
  .digest("hex");

export interface PropertyGuidanceInput {
  req: Request;
  propertyId: number;
  parsed: Record<string, unknown>;
  fullContent: string;
  params: ResearchParams;
  model: string;
  secondaryModel: string | undefined;
  startTime: number;
  earlyRunId: number | undefined;
  specialistId?: string;
}

export interface PropertyGuidanceResult {
  earlyRunFinalized: boolean;
}

/**
 * Extract property guidance records from the parsed research output, write
 * them to the assumption store, fan-out into the vector index, and either
 * finalize the existing early `research_runs` row or create a fresh one.
 */
export async function persistPropertyGuidance(
  input: PropertyGuidanceInput,
): Promise<PropertyGuidanceResult> {
  const {
    req,
    propertyId,
    parsed,
    fullContent,
    params,
    model,
    secondaryModel,
    startTime,
    earlyRunId,
    specialistId,
  } = input;

  let earlyRunFinalized = false;
  try {
    const guidanceResult = extractGuidance(parsed, 1, "property");
    if (guidanceResult.records.length > 0) {
      const property = await storage.getProperty(propertyId);
      if (property) {
        let runId: number;
        const runMetadata: Record<string, unknown> = {
          guidanceRecords: guidanceResult.records.length,
          errors: guidanceResult.errors,
        };
        if (specialistId) runMetadata.specialistId = specialistId;
        if (earlyRunId) {
          await storage.updateResearchRun(earlyRunId, {
            status: "completed",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            tokensUsed: Math.round(
              (JSON.stringify(params).length + fullContent.length) / 4,
            ),
            metadata: runMetadata,
          });
          runId = earlyRunId;
          earlyRunFinalized = true;
        } else {
          const runRecord = await storage.createResearchRun({
            userId: getAuthUser(req).id,
            entityType: "property",
            entityId: propertyId,
            scenarioId: null,
            tier: 1,
            status: "completed",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            modelPrimary: model,
            modelSecondary: secondaryModel ?? null,
            tokensUsed: Math.round(
              (JSON.stringify(params).length + fullContent.length) / 4,
            ),
            estimatedCost: null,
            error: null,
            metadata: runMetadata,
          });
          runId = runRecord.id;
        }

        // ── Phase 5C-task-1: write cache_key + cache_inputs_hash ──
        // Non-fatal — a missing cache_key means cold-misses on the verdict
        // cache, not data loss. Matches the pattern in analyst-scoped-runner.ts.
        try {
          const producedFields = Array.from(
            new Set(guidanceResult.records.map((r) => r.assumptionKey)),
          ) as CanonicalResearchField[];
          const propertyInputs: PropertyCacheInputs = {
            type: property.hospitalityType ?? null,
            businessModel: property.businessModel ?? null,
            location: property.location ?? null,
            market: property.market ?? null,
            country: property.country ?? null,
            stateProvince: property.stateProvince ?? null,
            marketTier: property.marketTier ?? null,
            propertyType: property.hospitalityType ?? null,
            qualityTier: property.qualityTier ?? null,
            serviceLevel: property.serviceLevel ?? null,
            roomCount: property.roomCount ?? null,
            maxGuests: property.maxGuests ?? null,
            purchasePrice: property.purchasePrice ?? null,
            buildingImprovements: property.buildingImprovements ?? null,
            acquisitionLTV: property.acquisitionLTV ?? null,
            operatingReserve: property.operatingReserve ?? null,
            inflationRate: property.inflationRate ?? null,
            taxRate: property.taxRate ?? null,
          };
          const inputContextHash = computeInputContextHash("property", propertyInputs, producedFields);
          const cacheKey = computeCacheKey({
            scenarioId: null,
            entityType: "property",
            entityId: propertyId,
            fieldGroup: producedFields,
            personaHash: PERSONA_HASH,
            inputContextHash,
            engineVersion: ENGINE_VERSION,
          });
          await storage.updateResearchRun(runId, { cacheKey, cacheInputsHash: inputContextHash });
        } catch (cacheErr: unknown) {
          logger.warn(
            `generate-persist-guidance: cache key write failed for property run ${runId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`,
            "research",
          );
        }

        const propLocation = property.location ?? "";
        const propType = property.hospitalityType ?? "boutique hotel";
        const propBusinessModel = property.businessModel ?? "hotel";
        for (const rec of guidanceResult.records) {
          await storage.upsertAssumptionGuidance({
            researchRunId: runId,
            entityType: "property",
            entityId: propertyId,
            scenarioId: null,
            assumptionKey: rec.assumptionKey,
            valueLow: rec.valueLow ?? null,
            valueMid: rec.valueMid ?? null,
            valueHigh: rec.valueHigh ?? null,
            confidence: rec.confidence,
            sourceName: rec.sourceName ?? null,
            sourceDate: rec.sourceDate ?? null,
            reasoning: rec.reasoning ?? null,
            comparableSet:
              (rec.comparableSet as Record<string, unknown>) ?? null,
          });

          // Index to Vector store for cross-property retrieval (fire-and-forget)
          indexAssumptionGuidance({
            entityType: "property",
            entityId: propertyId,
            scenarioId: null,
            location: propLocation,
            propertyType: propType,
            businessModel: propBusinessModel,
            assumptionKey: rec.assumptionKey,
            valueLow: rec.valueLow ?? null,
            valueMid: rec.valueMid ?? null,
            valueHigh: rec.valueHigh ?? null,
            confidence:
              rec.confidence === "high"
                ? 0.9
                : rec.confidence === "medium"
                  ? 0.7
                  : 0.4,
            reasoning: rec.reasoning ?? null,
          }).catch((err) =>
            logger.warn(
              `Failed to index guidance to Vector store: ${err}`,
              "research",
            ),
          );
        }

        logger.info(
          `RI v2: wrote ${guidanceResult.records.length} guidance records for property ${propertyId} (run ${runId})`,
          "research",
        );
      }
    }
    if (guidanceResult.errors.length > 0) {
      logger.warn(
        `RI v2 extraction errors: ${guidanceResult.errors.join("; ")}`,
        "research",
      );
    }
  } catch (err: unknown) {
    logger.warn(
      `RI v2 guidance extraction failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      "research",
    );
  }

  return { earlyRunFinalized };
}

export interface CompanyGuidanceInput {
  req: Request;
  ga: GlobalAssumptions;
  parsed: Record<string, unknown>;
  fullContent: string;
  params: ResearchParams;
  model: string;
  secondaryModel: string | undefined;
  startTime: number;
  earlyRunId?: number;
  specialistId?: string;
}

export interface CompanyGuidanceResult {
  earlyRunFinalized: boolean;
}

/**
 * Extract company guidance records from the parsed research output, write
 * them to the assumption store, fan-out into the vector index, and either
 * finalize the existing early `research_runs` row (specialist-scoped runs)
 * or create a fresh one.
 */
export async function persistCompanyGuidance(
  input: CompanyGuidanceInput,
): Promise<CompanyGuidanceResult> {
  const {
    req,
    ga,
    parsed,
    fullContent,
    params,
    model,
    secondaryModel,
    startTime,
    earlyRunId,
    specialistId,
  } = input;

  let earlyRunFinalized = false;
  try {
    const guidanceResult = extractGuidance(parsed, 1, "company");
    if (guidanceResult.records.length > 0) {
      const ownerUserId = getAuthUser(req).id;
      const runMetadata: Record<string, unknown> = {
        guidanceRecords: guidanceResult.records.length,
        errors: guidanceResult.errors,
      };
      if (specialistId) runMetadata.specialistId = specialistId;
      let runId: number;
      if (earlyRunId) {
        await storage.updateResearchRun(earlyRunId, {
          status: "completed",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          tokensUsed: Math.round(
            (JSON.stringify(params).length + fullContent.length) / 4,
          ),
          metadata: runMetadata,
        });
        runId = earlyRunId;
        earlyRunFinalized = true;
      } else {
        const runRecord = await storage.createResearchRun({
          userId: getAuthUser(req).id,
          entityType: "company",
          entityId: ownerUserId,
          scenarioId: null,
          tier: 1,
          status: "completed",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          modelPrimary: model,
          modelSecondary: secondaryModel ?? null,
          tokensUsed: Math.round(
            (JSON.stringify(params).length + fullContent.length) / 4,
          ),
          estimatedCost: null,
          error: null,
          metadata: runMetadata,
        });
        runId = runRecord.id;
      }

      // ── Phase 5C-task-1: write cache_key + cache_inputs_hash ──
      try {
        const producedFields = Array.from(
          new Set(guidanceResult.records.map((r) => r.assumptionKey)),
        ) as CanonicalResearchField[];
        const companyInputs: CompanyCacheInputs = {
          country: ga?.companyCountry ?? null,
          capitalRaise1Amount: ga?.capitalRaise1Amount ?? null,
          capitalRaise2Amount: ga?.capitalRaise2Amount ?? null,
          baseManagementFee: ga?.baseManagementFee ?? null,
          incentiveManagementFee: ga?.incentiveManagementFee ?? null,
        };
        const inputContextHash = computeInputContextHash("company", companyInputs, producedFields);
        const cacheKey = computeCacheKey({
          scenarioId: null,
          entityType: "company",
          entityId: ownerUserId,
          fieldGroup: producedFields,
          personaHash: PERSONA_HASH,
          inputContextHash,
          engineVersion: ENGINE_VERSION,
        });
        await storage.updateResearchRun(runId, { cacheKey, cacheInputsHash: inputContextHash });
      } catch (cacheErr: unknown) {
        logger.warn(
          `generate-persist-guidance: cache key write failed for company run ${runId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`,
          "research",
        );
      }

      for (const rec of guidanceResult.records) {
        await storage.upsertAssumptionGuidance({
          researchRunId: runId,
          entityType: "company",
          entityId: ownerUserId,
          scenarioId: null,
          assumptionKey: rec.assumptionKey,
          valueLow: rec.valueLow ?? null,
          valueMid: rec.valueMid ?? null,
          valueHigh: rec.valueHigh ?? null,
          confidence: rec.confidence,
          sourceName: rec.sourceName ?? null,
          sourceDate: rec.sourceDate ?? null,
          reasoning: rec.reasoning ?? null,
          comparableSet:
            (rec.comparableSet as Record<string, unknown>) ?? null,
        });

        // Index to Vector store for cross-entity retrieval (fire-and-forget)
        indexAssumptionGuidance({
          entityType: "company",
          entityId: ownerUserId,
          scenarioId: null,
          location: ga?.companyName ?? "Management Company",
          propertyType: "management company",
          assumptionKey: rec.assumptionKey,
          valueLow: rec.valueLow ?? null,
          valueMid: rec.valueMid ?? null,
          valueHigh: rec.valueHigh ?? null,
          confidence:
            rec.confidence === "high"
              ? 0.9
              : rec.confidence === "medium"
                ? 0.7
                : 0.4,
          reasoning: rec.reasoning ?? null,
        }).catch((err) =>
          logger.warn(
            `Failed to index company guidance to Vector store: ${err}`,
            "research",
          ),
        );
      }

      logger.info(
        `RI v2: wrote ${guidanceResult.records.length} guidance records for company entity (user ${ownerUserId}, run ${runId})`,
        "research",
      );
    }
    if (guidanceResult.errors.length > 0) {
      logger.warn(
        `RI v2 company extraction errors: ${guidanceResult.errors.join("; ")}`,
        "research",
      );
    }
  } catch (err: unknown) {
    logger.warn(
      `RI v2 company guidance extraction failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      "research",
    );
  }

  return { earlyRunFinalized };
}
