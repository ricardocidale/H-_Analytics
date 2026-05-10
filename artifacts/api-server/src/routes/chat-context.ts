import { storage } from "../storage";
import { buildPropertyContext } from "../ai/buildPropertyContext.js";
import { logger } from "../logger";
import { buildRebeccaContext } from "../ai/rebecca-context-builder";
import { PAGE_LABELS, VALID_PAGE_KEYS, OBSERVATION_DELIMITER } from "@shared/rebecca-pages";
import type { PageKey } from "@shared/rebecca-pages";
import { retrieveDocumentContext, multiNamespaceQuery, hybridQuery } from "../ai/vector-store-service";
import { retrieveRelevantChunks } from "../ai/knowledge-base";
import { searchAssets, buildAssetContext, type AssetMatch } from "../ai/asset-intelligence";
import { DEFAULT_PROJECTION_YEARS, isAdminRole } from "@shared/constants";
import { getFactoryNumber } from "@shared/model-constants-registry";
import { resolveDefault } from "../defaults";
import type { SourceBlockPresence, RebeccaSettings } from "@shared/rebecca-settings";
import type { RetrievalManifestEntry } from "../ai/rebecca-context-contract";
import { deriveContextType, deriveContextKey } from "./chat-prompts";

export class ContextAccessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ContextAccessError";
  }
}

export interface BuildChatContextParams {
  userId: number;
  isAdmin: boolean;
  authUser: {
    email: string;
    role: string;
    company?: string | null;
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  ga: any;
  properties: any[];
  fieldCtx:
    | {
        entityType: "property" | "company";
        entityId: number;
        fieldKey?: string;
        scenarioId?: number | null;
      }
    | undefined
    | null;
  message: string;
  rebeccaSettings: RebeccaSettings;
  currentPage?: string | null;
  userName: string;
}

export interface BuildChatContextResult {
  contextBlock: string;
  ragContextBlock: string;
  documentContextBlock: string;
  assetContextBlock: string;
  rebeccaFieldBlock: string;
  manifest: RetrievalManifestEntry[];
  blockPresence: SourceBlockPresence;
  matchedAssets: AssetMatch[];
  autoGreeting: string | null;
  observations: string[];
  contextType: string;
  contextKey: string | null;
  propertyId: number | null;
}

export async function buildChatContext(
  params: BuildChatContextParams,
): Promise<BuildChatContextResult> {
  const {
    userId,
    isAdmin,
    authUser,
    ga,
    properties,
    fieldCtx,
    message,
    rebeccaSettings,
    currentPage,
    userName,
  } = params;

  const propertyContext = buildPropertyContext(properties);

  const fundingInterestRate = ga?.fundingInterestRate ?? 0;
  const fundingLines: string[] = [];
  fundingLines.push(`Funding Source: ${ga?.fundingSourceLabel ?? "Funding Vehicle"}`);
  fundingLines.push(
    `Capital Raise 1: $${(ga?.capitalRaise1Amount ?? 0).toLocaleString()} (${ga?.capitalRaise1Date ?? "N/A"})`,
  );
  fundingLines.push(
    `Capital Raise 2: $${(ga?.capitalRaise2Amount ?? 0).toLocaleString()} (${ga?.capitalRaise2Date ?? "N/A"})`,
  );
  if ((ga?.capitalRaiseValuationCap ?? 0) > 0) {
    fundingLines.push(`Valuation Cap: $${ga.capitalRaiseValuationCap.toLocaleString()}`);
  }
  if ((ga?.capitalRaiseDiscountRate ?? 0) > 0) {
    fundingLines.push(`Discount Rate: ${(ga.capitalRaiseDiscountRate * 100).toFixed(0)}%`);
  }
  if (fundingInterestRate > 0) {
    fundingLines.push(`Interest Rate: ${(fundingInterestRate * 100).toFixed(1)}% annual`);
    fundingLines.push(
      `Interest Payment: ${ga?.fundingInterestPaymentFrequency === "quarterly" ? "Paid Quarterly" : ga?.fundingInterestPaymentFrequency === "annually" ? "Paid Annually" : "Accrues Only"}`,
    );
  }
  const baseFee = ga?.baseManagementFee ?? 0;
  const incentiveFee = ga?.incentiveManagementFee ?? 0;

  const validPage =
    currentPage && (VALID_PAGE_KEYS as readonly string[]).includes(currentPage)
      ? (currentPage as PageKey)
      : null;
  const pageDescription = validPage ? PAGE_LABELS[validPage] : "Unknown";

  const userContextLines: string[] = [
    "CURRENT USER:",
    `Name: ${userName}`,
    `Email: ${authUser.email}`,
    `Role: ${authUser.role}`,
    `Company: ${authUser.company ?? "N/A"}`,
    `Title: ${authUser.title ?? "N/A"}`,
    `Currently viewing: ${pageDescription}`,
  ];

  let scenarioContextBlock = "";
  try {
    if (isAdmin) {
      const allScenarios = await storage.getAllScenarios();
      if (allScenarios.length > 0) {
        const scenarioLines = ["", "ALL SCENARIOS (admin view — you can see who owns each):"];
        for (const s of allScenarios.slice(0, 20)) {
          const ownerName = s.ownerName ?? s.ownerEmail;
          const propCount = Array.isArray(s.properties) ? s.properties.length : 0;
          const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "N/A";
          scenarioLines.push(
            `- "${s.name}" by ${ownerName} (${s.ownerEmail}) | ${propCount} properties | ${s.kind ?? "manual"} | updated ${updated}${s.isLocked ? " [LOCKED]" : ""}`,
          );
        }
        if (allScenarios.length > 20) {
          scenarioLines.push(`  ... and ${allScenarios.length - 20} more scenarios`);
        }
        scenarioContextBlock = scenarioLines.join("\n");
      }
    } else {
      const userScenarios = await storage.getScenariosByUser(userId);
      if (userScenarios.length > 0) {
        const scenarioLines = ["", "YOUR SCENARIOS:"];
        for (const s of userScenarios.slice(0, 10)) {
          const propCount = Array.isArray(s.properties) ? s.properties.length : 0;
          const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "N/A";
          scenarioLines.push(
            `- "${s.name}" | ${propCount} properties | ${s.kind ?? "manual"} | updated ${updated}`,
          );
        }
        scenarioContextBlock = scenarioLines.join("\n");
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `Scenario context build failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
      "chat",
    );
  }

  // W0.2 — verification opinion + per-source freshness when a property is in scope.
  let verificationContextBlock = "";
  if (fieldCtx?.entityType === "property") {
    try {
      const [latestRun] = await storage.getVerificationRuns(1);
      if (latestRun) {
        const runDate = new Date(latestRun.createdAt).toLocaleDateString();
        verificationContextBlock = `\n\nPORTFOLIO VERIFICATION (as of ${runDate}):\nOpinion: ${latestRun.auditOpinion} | Checks: ${latestRun.totalChecks} total, ${latestRun.passed} passed, ${latestRun.failed} failed`;
      }
    } catch (err: unknown) {
      logger.warn(
        `Verification context load failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
        "chat",
      );
    }
  }

  const contextBlock = [
    ...userContextLines,
    "",
    "PORTFOLIO DATA:",
    propertyContext,
    "",
    `Company: ${ga?.companyName ?? "Management Company"}`,
    `Properties in Portfolio: ${properties.length}`,
    `Projection Years: ${ga?.projectionYears ?? (await resolveDefault<number>("mc.setup.projectionYears")) ?? DEFAULT_PROJECTION_YEARS}`,
    `Inflation Rate: ${((ga?.inflationRate ?? (await resolveDefault<number>("mc.property_defaults.propertyInflationRate")) ?? getFactoryNumber("inflationRate", "United States")) * 100).toFixed(1)}%`,
    `Base Management Fee: ${(baseFee * 100).toFixed(1)}%`,
    `Incentive Management Fee: ${(incentiveFee * 100).toFixed(1)}%`,
    "",
    "FUNDING:",
    ...fundingLines,
    scenarioContextBlock,
    verificationContextBlock,
  ].join("\n");

  // Task #539 / #551 — every retrieval branch fills a typed slot on
  // `manifest` instead of pushing directly to a sources array.
  const manifest: RetrievalManifestEntry[] = [];

  // Task #532 — track which Knowledge & Sources blocks actually
  // contributed content this turn so the admin Test Chat can show
  // a "blocks included" badge list.
  const blockPresence: SourceBlockPresence = {
    portfolio: false,
    knowledgeBase: false,
    research: false,
    documents: false,
    uploadedFiles: false,
    webSearch: false,
  };

  let documentContextBlock = "";
  try {
    if (!rebeccaSettings.sources.documents.enabled) throw new Error("__skip_documents__");
    const docPropertyId = fieldCtx?.entityType === "property" ? fieldCtx.entityId : undefined;
    const docResults = await retrieveDocumentContext({
      query: message,
      propertyId: docPropertyId,
      topK: 3,
    });
    if (docResults.length > 0) {
      const docLines = docResults.map(
        (d) =>
          `[${d.documentType}] ${d.propertyName} (score: ${d.score.toFixed(2)}):\n${d.content.slice(0, 800)}`,
      );
      documentContextBlock = `\n\nRELEVANT DOCUMENTS:\n${docLines.join("\n\n")}`;
      blockPresence.documents = true;
      for (const d of docResults) {
        manifest.push({
          sourceKey: "documents",
          namespace: "documents",
          itemId: `property:${docPropertyId}:${d.documentType}`,
          title: `${d.propertyName} — ${d.documentType}`,
          score: d.score,
          retrievalMode: "semantic",
        });
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `Document context retrieval failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
      "chat",
    );
  }

  let ragContextBlock = "";
  try {
    const wantKB = rebeccaSettings.sources.knowledgeBase.enabled;
    const wantResearch = rebeccaSettings.sources.research.enabled;
    const [kbChunks, multiResults] = await Promise.all([
      wantKB
        ? retrieveRelevantChunks(message, 4)
        : Promise.resolve([] as Awaited<ReturnType<typeof retrieveRelevantChunks>>),
      wantResearch
        ? (async () => {
            // Task #T002: Hybrid retrieval for assumption-guidance
            let guidanceMatches: any[] = [];

            if (fieldCtx?.entityType && fieldCtx?.entityId) {
              const hybridResult = await hybridQuery({
                namespace: "assumption-guidance",
                exactFilters: {
                  entityType: fieldCtx.entityType,
                  entityId: fieldCtx.entityId,
                  ...(fieldCtx.fieldKey ? { assumptionKey: fieldCtx.fieldKey } : {}),
                },
                semanticQuery: message,
                topK: 5,
              });
              guidanceMatches = hybridResult.matches.map((m) => ({
                ...m,
                namespace: "assumption-guidance",
                retrievalMode: hybridResult.mode,
              }));
            } else {
              guidanceMatches = (
                await multiNamespaceQuery(message, ["assumption-guidance"], 4)
              ).map((m) => ({ ...m, retrievalMode: "semantic" }));
            }

            const historyMatches = (
              await multiNamespaceQuery(message, ["research-history"], 4)
            ).map((m) => ({ ...m, retrievalMode: "semantic" }));

            return [...guidanceMatches, ...historyMatches];
          })()
        : Promise.resolve([] as any[]),
    ]);

    const ragParts: string[] = [];
    const MAX_RAG_CHARS = 3000;
    let ragChars = 0;

    for (const chunk of kbChunks) {
      if (chunk.score < 0.45) continue;
      const entry = `[${chunk.source}] ${chunk.title} (${chunk.score.toFixed(2)}):\n${chunk.content.slice(0, 600)}`;
      if (ragChars + entry.length > MAX_RAG_CHARS) break;
      ragParts.push(entry);
      ragChars += entry.length;
      manifest.push({
        sourceKey: "knowledgeBase",
        namespace: "knowledge-base",
        itemId: (chunk as any).id,
        title: chunk.title || chunk.source || "Knowledge entry",
        score: chunk.score,
        retrievalMode: "semantic",
      });
      blockPresence.knowledgeBase = true;
    }

    const userPropertyIds = new Set(properties.map((p) => p.id));
    for (const match of multiResults) {
      if (match.score < 0.45) continue;
      if (
        match.namespace !== "research-history" &&
        match.namespace !== "assumption-guidance"
      )
        continue;
      const matchPropId = Number(match.metadata.propertyId ?? 0);
      if (matchPropId > 0 && !userPropertyIds.has(matchPropId)) continue;
      let body: string;
      let title: string;
      if (match.namespace === "research-history") {
        body = String(match.metadata.summary ?? "");
        title =
          `${match.metadata.location ?? ""} ${match.metadata.propertyType ?? ""} research`.trim();
      } else {
        const low = match.metadata.valueLow ?? "";
        const mid = match.metadata.valueMid ?? "";
        const high = match.metadata.valueHigh ?? "";
        const reasoning = String(match.metadata.reasoning ?? "");
        body = reasoning
          ? `Range: ${low}–${mid}–${high}. ${reasoning}`
          : `Range: ${low}–${mid}–${high}`;
        title = `${match.metadata.assumptionKey ?? match.id} guidance (${match.metadata.location ?? ""})`;
      }
      if (!body) continue;
      const entry = `[${match.namespace}] ${title} (${match.score.toFixed(2)}):\n${body.slice(0, 600)}`;
      if (ragChars + entry.length > MAX_RAG_CHARS) break;
      ragParts.push(entry);
      ragChars += entry.length;
      manifest.push({
        sourceKey: "research",
        namespace: match.namespace as any,
        itemId: String(match.id),
        title,
        score: match.score,
        retrievalMode: (match as any).retrievalMode || "semantic",
      });
      blockPresence.research = true;
    }

    if (ragParts.length > 0) {
      ragContextBlock = `\n\nKNOWLEDGE BASE & RESEARCH CONTEXT:\n${ragParts.join("\n\n")}`;
    }
  } catch (err: unknown) {
    logger.warn(
      `RAG context retrieval failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
      "chat",
    );
  }

  let assetContextBlock = "";
  let matchedAssets: AssetMatch[] = [];
  try {
    const visualKeywords =
      /\b(photo|photos|picture|pictures|image|images|logo|logos|show me|what does .* look like|how does .* look|visual|gallery|branding)\b/i;
    const propertyNameMatch = properties.find(
      (p) => p.name && message.toLowerCase().includes(p.name.toLowerCase()),
    );
    if (
      rebeccaSettings.sources.uploadedFiles.enabled &&
      (visualKeywords.test(message) || propertyNameMatch)
    ) {
      const searchQuery = propertyNameMatch ? `${propertyNameMatch.name} ${message}` : message;
      const accessibleIds = isAdmin ? undefined : properties.map((p) => p.id);
      matchedAssets = await searchAssets(searchQuery, 4, accessibleIds);
      if (matchedAssets.length > 0) {
        assetContextBlock = "\n\n" + buildAssetContext(matchedAssets);
        blockPresence.uploadedFiles = true;
        for (const asset of matchedAssets) {
          manifest.push({
            sourceKey: "uploadedFiles",
            namespace: "uploaded-files",
            itemId: String(asset.id),
            title:
              asset.caption?.trim() ||
              `${asset.type[0].toUpperCase()}${asset.type.slice(1)} #${asset.id}`,
            score: asset.score,
            retrievalMode: "semantic",
          });
        }
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `Asset search failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
      "chat",
    );
  }

  let rebeccaFieldBlock = "";
  let autoGreeting: string | null = null;
  let observations: string[] = [];
  if (fieldCtx) {
    try {
      if (fieldCtx.entityType === "property") {
        const entity = properties.find((p) => p.id === fieldCtx.entityId);
        if (!entity) {
          throw new ContextAccessError("CHAT-007", "Entity not found or access denied");
        }
      } else if (fieldCtx.entityType === "company") {
        if (!isAdminRole(authUser.role)) {
          throw new ContextAccessError("CHAT-008", "Entity not found or access denied");
        }
      }
      const ctxPayload = await buildRebeccaContext(userId, fieldCtx);
      const fieldParts: string[] = ["", "FOCUSED ENTITY CONTEXT:", ctxPayload.entitySummary];
      if (ctxPayload.fieldContext) {
        fieldParts.push("", "FIELD-SPECIFIC RESEARCH:", ctxPayload.fieldContext);
      }
      rebeccaFieldBlock = fieldParts.join("\n");
      autoGreeting = ctxPayload.autoGreeting;

      const obsMarker = "⚠️ Observations:";
      const obsIdx = ctxPayload.entitySummary.indexOf(obsMarker);
      if (obsIdx !== -1) {
        const obsText = ctxPayload.entitySummary.slice(obsIdx + obsMarker.length).trim();
        observations = obsText
          .split(OBSERVATION_DELIMITER)
          .map((s) => s.trim())
          .filter((s) => s.length > 10);
      }
    } catch (err: unknown) {
      if (err instanceof ContextAccessError) throw err;
      logger.warn(
        `Failed to build Rebecca field context: ${err instanceof Error ? err.message : String(err)}`,
        "chat",
      );
    }
  }

  if (contextBlock) {
    manifest.push({
      sourceKey: "portfolio",
      namespace: "portfolio",
      title: "Portfolio Context",
      retrievalMode: "injected",
    });
  }

  if (rebeccaFieldBlock) {
    manifest.push({
      sourceKey: "field-context",
      namespace: "field-context",
      title: "Field-Specific Research",
      retrievalMode: "injected",
    });
  }

  // Portfolio presence gating — set before returning so the prompt builder
  // can honour the sources.portfolio toggle via assembleSystemPrompt.
  blockPresence.portfolio = contextBlock.length > 0;

  const contextType = deriveContextType(fieldCtx ?? undefined);
  const contextKey = deriveContextKey(fieldCtx ?? undefined);
  const propertyId = fieldCtx?.entityType === "property" ? fieldCtx.entityId : null;

  return {
    contextBlock,
    ragContextBlock,
    documentContextBlock,
    assetContextBlock,
    rebeccaFieldBlock,
    manifest,
    blockPresence,
    matchedAssets,
    autoGreeting,
    observations,
    contextType,
    contextKey,
    propertyId,
  };
}
