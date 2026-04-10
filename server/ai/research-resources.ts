import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger";

export const RESEARCH_SKILLS_DIR = join(process.cwd(), ".claude", "skills", "research");

export const PROPERTY_RESEARCH_SKILLS = [
  "market-overview",
  "adr-analysis",
  "occupancy-analysis",
  "event-demand",
  "cap-rate-analysis",
  "competitive-set",
  "land-value",
  "operating-costs",
  "property-value-costs",
  "management-service-fees",
  "income-tax",
  "local-economics",
  "marketing-costs",
];

export const SKILL_FOLDER_MAP: Record<string, string | string[]> = {
  property: PROPERTY_RESEARCH_SKILLS,
  company: "company-research",
  global: "global-research",
};

export const isDev = process.env.NODE_ENV === "development";
export const skillCache = new Map<string, string>();
export let toolCache: Anthropic.Tool[] | null = null;

export const CONFIDENCE_PREAMBLE = `## Confidence Scoring (applies to all recommendations)
Every recommended value must include a "confidence" field using EXACTLY one of these labels:
- **"high"**: Multiple independent sources agree (<15% divergence) OR API-confirmed with strong comparables. Use for well-established markets with abundant data.
- **"medium"**: Single reliable source, moderate comparable coverage, or 15–25% divergence between sources. Use for secondary markets or when data is recent but limited.
- **"low"**: Sparse data, >25% divergence, no API anchor, stale comparables (>6 months old), or emerging/niche markets. Use when significant uncertainty exists.

IMPORTANT: Do NOT use "conservative", "moderate", or "aggressive" as confidence labels — those describe positioning, not evidence quality. Always use "high", "medium", or "low".

## Chain-of-Thought Reasoning (follow for every metric)
For each metric you analyze:
1. **Anchor**: State the benchmark or API value if available — this is your starting point.
2. **Evidence**: Cite comparable properties, market data, or industry benchmarks that support your recommendation.
3. **Adjustments**: Explain any adjustments from the anchor (location, property type, market cycle, seasonality).
4. **Range**: Provide a low-to-high range reflecting uncertainty, then a midpoint estimate.
5. **Confidence**: Assign "high", "medium", or "low" based on evidence quality (not positioning).
Include this reasoning in the "reasoning" or "rationale" field for each section.

## Seasonality & Market Cycle Context
Consider the current phase of the hospitality market cycle (expansion, peak, contraction, trough) and seasonal demand patterns for the property's location. Flag seasonal ADR/occupancy variations and how they affect annualized projections.

## Per-Unit Metrics
Where applicable, express costs and revenues on a per-available-room (PAR) or per-occupied-room (POR) basis alongside percentage-of-revenue figures. This enables cross-property comparison.

## GAAP / USALI Compliance
All property-level operating cost recommendations must align with the Uniform System of Accounts for the Lodging Industry (USALI) departmental structure. Revenue and expense categories should map to USALI departments (Rooms, F&B, Admin & General, Sales & Marketing, Property Operations, Utilities, IT, FF&E Reserve).

## Deterministic Tools
For any arithmetic (RevPAR, room revenue, NOI, depreciation, debt capacity, cost dollar amounts, occupancy schedules, ADR projections, cap rate valuations), call the appropriate compute_* tool. Never compute financial math in prose.
`;

export function loadSkill(type: string): string {
  if (!isDev) {
    const cached = skillCache.get(type);
    if (cached) return cached;
  }

  const mapping = SKILL_FOLDER_MAP[type];
  if (!mapping) {
    throw new Error(`Unknown research type: ${type}. Must be 'property', 'company', or 'global'.`);
  }

  let content: string;
  if (Array.isArray(mapping)) {
    content = CONFIDENCE_PREAMBLE + mapping
      .map((folder) => {
        const skillPath = join(RESEARCH_SKILLS_DIR, folder, "SKILL.md");
        return readFileSync(skillPath, "utf-8");
      })
      .join("\n\n---\n\n");
  } else {
    const skillPath = join(RESEARCH_SKILLS_DIR, mapping, "SKILL.md");
    content = CONFIDENCE_PREAMBLE + readFileSync(skillPath, "utf-8");
  }

  skillCache.set(type, content);
  return content;
}

export function loadToolDefinitions(): Anthropic.Tool[] {
  if (!isDev && toolCache) return toolCache;

  const tools: Anthropic.Tool[] = [];
  const seen = new Set<string>();

  function scanDir(dir: string) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".json")) {
          const content = JSON.parse(readFileSync(fullPath, "utf-8"));
          if (seen.has(content.name)) {
            logger.warn(`Duplicate tool definition skipped: ${content.name} in ${fullPath}`, "research-resources");
            continue;
          }
          seen.add(content.name);
          if (!content.input_schema) {
            continue;
          }
          const schema = content.input_schema;
          if (!schema.type) schema.type = "object";
          if (schema.properties && (typeof schema.properties !== "object" || Array.isArray(schema.properties))) {
            logger.warn(`Skipping tool with invalid properties: ${content.name} in ${fullPath}`, "research-resources");
            continue;
          }
          tools.push({
            name: content.name,
            description: content.description,
            input_schema: schema,
          });
        }
      }
    } catch (err: unknown) {
      logger.warn(`[research-resources] Failed to scan tool directory: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const folder of PROPERTY_RESEARCH_SKILLS) {
    scanDir(join(RESEARCH_SKILLS_DIR, folder, "tools"));
  }

  const globalToolsDir = join(process.cwd(), ".claude", "tools");
  scanDir(globalToolsDir); // recursive — covers .claude/tools/research/ too

  toolCache = tools;
  return tools;
}

export function validateSkillFolders(): void {
  const allFolders = [...PROPERTY_RESEARCH_SKILLS, "company-research", "global-research"];
  const missing: string[] = [];

  for (const folder of allFolders) {
    const skillPath = join(RESEARCH_SKILLS_DIR, folder, "SKILL.md");
    if (!existsSync(skillPath)) {
      missing.push(folder);
    }
  }

  if (missing.length > 0) {
    logger.error(`Missing research skill folders: ${missing.join(", ")}`, "research-resources");
  }
}
