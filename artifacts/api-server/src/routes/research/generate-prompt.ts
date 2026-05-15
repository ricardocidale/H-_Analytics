import type { Request } from "express";
import { storage } from "../../storage";
import { getAuthUser } from "../../auth";
import { isAdminRole } from "@shared/constants";
import { getEffectivePropertyView, type PropertyRow } from "@workspace/db";
import { logger } from "../../logger";
import { buildPropertyContextPack } from "../../ai/context-pack/property-pack";
import { buildCompanyContextPack } from "../../ai/context-pack/company-pack";
import { assembleResearchPrompt } from "../../ai/prompt/assemble-research-prompt";
import {
  isVectorStoreAvailable,
  retrieveSimilarGuidance,
} from "../../ai/vector-store-service";
import { buildCompanyDataInjection } from "../../ai/company-data-injector";
import type { IcpConfig } from "@workspace/db";
import type { PropertyContextPack } from "../../ai/context-pack/types";
import type { ResearchParams } from "../../ai/research-prompt-builders";
import type { GlobalAssumptions } from "@workspace/db";

export interface AssemblePromptInput {
  req: Request;
  type: "property" | "company" | "global";
  propertyId: number | undefined;
  ga: GlobalAssumptions | undefined;
  params: ResearchParams;
  smartRouterInjection: string;
  companyProperties?: Awaited<ReturnType<typeof storage.getAllProperties>>;
}

export interface AssemblePromptResult {
  v2Prompt: string | undefined;
  propertyContextPack: PropertyContextPack | undefined;
}

/**
 * Build the V2 research prompt with property/company context packs, prior
 * guidance from the vector store, smart-router verified data, and the
 * company-data injection block. Mutates `params.propertyContext` to enrich
 * it with entity-aware fields when running property research.
 */
export async function assembleResearchV2Prompt(
  input: AssemblePromptInput,
): Promise<AssemblePromptResult> {
  const { req, type, propertyId, ga, params, smartRouterInjection } = input;

  let v2Prompt: string | undefined;
  let propertyContextPack: PropertyContextPack | undefined;

  try {
    let ambientDataStr: string | undefined;
    const benchmarks = await storage.getBenchmarkSnapshots();
    if (benchmarks.length > 0) {
      ambientDataStr = benchmarks
        .map(
          (b) =>
            `${b.snapshotKey} (${b.category}): ${b.value}${
              b.source ? ` [${b.source}]` : ""
            }${b.staleness === "stale" ? " [STALE]" : ""}`,
        )
        .join("\n");
    }

    if (type === "property" && propertyId) {
      const property = await storage.getProperty(propertyId);
      if (property) {
        const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
        propertyContextPack = buildPropertyContextPack(
          property,
          ga ?? null,
          icpConfig,
        );

        // Task 4.5: Enrich propertyContext with entity-aware fields from DB property.
        // Plan 2026-05-13-002 U3 — descriptor reads (fbVenues, fbSeats,
        // eventSpaceSqft, totalBuildingSqft, lastRenovationYear) go through
        // the accessor's effective view so the LLM sees the post-renovation
        // (As-Improved) value when one is set, falling back to As-Purchased
        // otherwise. Non-descriptor fields are read raw.
        if (params.propertyContext) {
          const p = property as Record<string, any>;
          const view = getEffectivePropertyView(p as PropertyRow) as Record<string, any>;
          params.propertyContext = {
            ...params.propertyContext,
            qualityTier: p.qualityTier ?? undefined,
            businessModel: p.businessModel ?? undefined,
            pricingModel: p.pricingModel ?? undefined,
            nightlyPropertyRate: p.nightlyPropertyRate ?? undefined,
            maxGuests: p.maxGuests ?? undefined,
            serviceLevel: p.serviceLevel ?? undefined,
            locationType: p.locationType ?? undefined,
            marketTier: p.marketTier ?? undefined,
            fbVenues: view.fbVenues ?? undefined,
            fbSeats: view.fbSeats ?? undefined,
            eventSpaceSqft: view.eventSpaceSqft ?? undefined,
            totalPropertyAcreage: p.totalPropertyAcreage ?? undefined,
            totalBuildingSqft: view.totalBuildingSqft ?? undefined,
            yearBuilt: p.yearBuilt ?? undefined,
            lastRenovationYear: view.lastRenovationYear ?? undefined,
            revShareFB: p.revShareFB ?? undefined,
            revShareEvents: p.revShareEvents ?? undefined,
            depreciationYears: p.depreciationYears ?? undefined,
            country: p.country ?? undefined,
            seasonalityProfile: p.seasonalityProfile ?? undefined,
            ownerPriorityReturn: p.ownerPriorityReturn ?? undefined,
            feeSubordination: p.feeSubordination ?? undefined,
          };
        }

        // Retrieve prior assumption guidance from similar properties (non-blocking)
        let priorGuidanceStr: string | undefined;
        try {
          if (isVectorStoreAvailable()) {
            const priorGuidance = await retrieveSimilarGuidance({
              location: property.location ?? "",
              propertyType: property.hospitalityType ?? "boutique hotel",
              businessModel: property.businessModel ?? "hotel",
              topK: 15,
            });
            if (priorGuidance.length > 0) {
              const lines = priorGuidance.map(
                (g) =>
                  `- **${g.assumptionKey}** (${g.location}, ${g.propertyType}): low=${g.valueLow ?? "—"}, mid=${g.valueMid ?? "—"}, high=${g.valueHigh ?? "—"} [confidence: ${g.confidence.toFixed(1)}, score: ${g.score.toFixed(2)}]${g.reasoning ? ` — ${g.reasoning.slice(0, 120)}` : ""}`,
              );
              priorGuidanceStr = `## Prior Assumption Benchmarks (from similar properties)\n\n${lines.join("\n")}`;
            }
          }
        } catch (err: unknown) {
          logger.warn(
            `Prior guidance retrieval failed (non-blocking): ${err instanceof Error ? err.message : err}`,
            "research",
          );
        }

        v2Prompt = assembleResearchPrompt(propertyContextPack, {
          tier: 1,
          entityType: "property",
          ambientData: ambientDataStr,
          priorResearch: priorGuidanceStr,
        });

        // Inject smart data router results into the prompt
        if (smartRouterInjection) {
          v2Prompt += smartRouterInjection;
        }
      }
    } else if (type === "company" && ga) {
      // Reuse properties fetched in the minimum-info gate above
      const properties =
        input.companyProperties ??
        (isAdminRole(getAuthUser(req).role)
          ? await storage.getAllProperties()
          : await storage.getAllProperties(getAuthUser(req).id));
      const serviceTemplates = await storage.getAllServiceTemplates();
      const companyPack = buildCompanyContextPack(
        ga,
        properties,
        serviceTemplates.map((st) => ({
          name: st.name,
          defaultRate: st.defaultRate ?? 0,
          serviceModel: st.serviceModel ?? "percentage",
          serviceMarkup: st.serviceMarkup ?? 0,
          isActive: st.isActive !== false,
        })),
      );
      v2Prompt = assembleResearchPrompt(companyPack, {
        tier: 1,
        entityType: "company",
        ambientData: ambientDataStr,
      });

      // Inject verified company data (FRED rates, country defaults, benchmarks, portfolio stats)
      try {
        const companyDataBlock = await buildCompanyDataInjection(properties);
        if (companyDataBlock && v2Prompt) {
          v2Prompt += companyDataBlock;
        }
      } catch (err: unknown) {
        logger.warn(
          `Company data injection failed (non-blocking): ${err instanceof Error ? err.message : err}`,
          "data-router",
        );
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `Research prompt assembly failed: ${err instanceof Error ? err.message : err}`,
      "research",
    );
  }

  return { v2Prompt, propertyContextPack };
}
