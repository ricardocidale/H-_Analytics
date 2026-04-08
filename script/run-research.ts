import { db } from "../server/db";
import { properties, globalAssumptions, marketResearch } from "../shared/schema";
import { getAnthropicClient } from "../server/ai/clients";
import { generateResearchWithToolsStream, parseResearchJSON, extractResearchValues } from "../server/ai/aiResearch";
import { validateResearchValues } from "../calc/research/validate-research";
import { getMarketIntelligenceAggregator } from "../server/services/MarketIntelligenceAggregator";
import { eq, isNull } from "drizzle-orm";

const DEFAULT_EVENT_CONFIG = {
  enabled: true,
  focusAreas: [],
  regions: [],
  timeHorizon: "10-year",
  customInstructions: "",
  customQuestions: "",
  refreshIntervalDays: 7,
};

async function generateAndSave(
  type: "property" | "company" | "global",
  anthropic: any,
  model: string,
  ga: any,
  propertyId?: number,
  propertyContext?: any,
) {
  const researchConfig = (ga?.researchConfig as any) ?? {};
  const rawEventConfig = researchConfig[type];
  const eventConfig = { ...DEFAULT_EVENT_CONFIG, ...(rawEventConfig ?? {}) };

  let marketIntelligence;
  try {
    const aggregator = getMarketIntelligenceAggregator();
    marketIntelligence = await aggregator.gather({
      location: propertyContext?.location || propertyContext?.market,
      propertyType: "boutique hotel",
      propertyId: propertyId || undefined,
    });
  } catch {
  // dotenv not available — environment variables already set
}

  const params = {
    type,
    propertyContext,
    assetDefinition: { description: ga?.assetDescription || undefined },
    propertyLabel: ga?.propertyLabel,
    eventConfig,
    marketIntelligence,
  };

  const stream = generateResearchWithToolsStream(params, anthropic, model);
  let fullContent = "";

  for await (const chunk of stream) {
    if (chunk.type === "content") fullContent += chunk.data;
    if (chunk.type === "error") {
      console.error(`  Error: ${chunk.data}`);
      return false;
    }
  }

  const parsed = parseResearchJSON(fullContent);

  if (type === "property" && propertyId && !parsed.rawResponse) {
    const researchValues = extractResearchValues(parsed);
    if (researchValues) {
      const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
      if (property) {
        const validated = validateResearchValues(researchValues, {
          roomCount: property.roomCount ?? 20,
          startAdr: property.startAdr ?? 300,
          maxOccupancy: property.maxOccupancy ?? 0.85,
          purchasePrice: property.purchasePrice ?? undefined,
          costRateRooms: property.costRateRooms ?? undefined,
          costRateFB: property.costRateFB ?? undefined,
        });
        const cleanValues: Record<string, { display: string; mid: number; source: "ai" }> = {};
        for (const [k, v] of Object.entries(validated.values)) {
          cleanValues[k] = { display: v.display, mid: v.mid, source: v.source };
        }
        await db.update(properties).set({ researchValues: cleanValues }).where(eq(properties.id, propertyId));
      }
    }
  }

  if (marketIntelligence) {
    parsed._marketIntelligence = {
      benchmarks: marketIntelligence.benchmarks || null,
      groundedResearch: marketIntelligence.groundedResearch || [],
      errors: marketIntelligence.errors || [],
      fetchedAt: marketIntelligence.fetchedAt,
    };
  }

  const existing = await db.select().from(marketResearch).where(
    propertyId
      ? eq(marketResearch.propertyId, propertyId)
      : eq(marketResearch.type, type)
  );

  if (existing.length > 0) {
    await db.update(marketResearch)
      .set({
        content: parsed,
        llmModel: model,
        updatedAt: new Date(),
      })
      .where(eq(marketResearch.id, existing[0].id));
  } else {
    await db.insert(marketResearch).values({
      userId: null,
      propertyId: propertyId || null,
      type,
      title: `${type === 'property' ? 'Property' : type === 'company' ? 'Company' : 'Global'} Research`,
      content: parsed,
      llmModel: model,
    });
  }

  return true;
}

async function main() {
  console.log("Starting full research generation...\n");

  const [ga] = await db.select().from(globalAssumptions).where(isNull(globalAssumptions.userId));
  const researchConfig = (ga?.researchConfig as any) ?? {};
  const model = researchConfig.preferredLlm || ga?.preferredLlm || "claude-sonnet-4-6";
  const anthropic = getAnthropicClient();

  console.log(`Using model: ${model}\n`);

  const allProperties = await db.select().from(properties);
  console.log(`Found ${allProperties.length} properties\n`);

  for (const prop of allProperties) {
    const start = Date.now();
    console.log(`Generating research for: ${prop.name}...`);
    const ok = await generateAndSave("property", anthropic, model, ga, prop.id, {
      name: prop.name,
      location: prop.location,
      market: prop.market,
      roomCount: prop.roomCount,
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(ok ? `  ✓ ${prop.name} complete (${elapsed}s)` : `  ✗ ${prop.name} failed (${elapsed}s)`);
  }

  console.log("\nGenerating company research...");
  let start = Date.now();
  let ok = await generateAndSave("company", anthropic, model, ga);
  console.log(ok ? `  ✓ Company complete (${((Date.now() - start) / 1000).toFixed(1)}s)` : `  ✗ Company failed`);

  console.log("\nGenerating global research...");
  start = Date.now();
  ok = await generateAndSave("global", anthropic, model, ga);
  console.log(ok ? `  ✓ Global complete (${((Date.now() - start) / 1000).toFixed(1)}s)` : `  ✗ Global failed`);

  await db.update(globalAssumptions)
    .set({ lastFullResearchRefresh: new Date() })
    .where(isNull(globalAssumptions.userId));

  console.log("\n✓ ALL RESEARCH COMPLETE - lastFullResearchRefresh updated");
  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
