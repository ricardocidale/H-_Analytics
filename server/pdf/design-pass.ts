import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logger } from "../logger";
import type { ReportDefinition } from "../report/types";

export interface LayoutHints {
  globalFontSizeScale: number;
  tableDensity: "cramped" | "comfortable" | "spacious";
  chartAreaOpacity: number;
  emphasizedKpis: string[];
  seriesColors: string[];
}

const layoutHintsSchema = z.object({
  globalFontSizeScale: z.number().min(0.5).max(2.0),
  tableDensity: z.enum(["cramped", "comfortable", "spacious"]),
  chartAreaOpacity: z.number().min(0).max(1),
  emphasizedKpis: z.array(z.string()),
  seriesColors: z.array(z.string()),
});

export const DEFAULT_HINTS: LayoutHints = {
  globalFontSizeScale: 1.1,
  tableDensity: "comfortable",
  chartAreaOpacity: 0.15,
  emphasizedKpis: [],
  seriesColors: [],
};

function buildManifest(report: ReportDefinition): string {
  const sections = report.sections.map((s) => {
    if (s.kind === "kpi") {
      return { type: "kpi", title: s.title, kpiCount: s.metrics.length };
    } else if (s.kind === "table") {
      return { type: "table", title: s.title, columns: s.years.length, rows: s.rows.length };
    } else if (s.kind === "chart") {
      return { type: "chart", title: s.title, series: s.series.length, years: s.years.length };
    } else {
      return { type: "image", title: s.title };
    }
  });

  const maxYears = report.sections
    .filter((s) => s.kind === "table")
    .reduce((max, s) => {
      if (s.kind === "table") return Math.max(max, s.years.length);
      return max;
    }, 0);

  return JSON.stringify({
    orientation: report.orientation,
    sectionCount: sections.length,
    sections,
    theme: {
      primary: report.tokens.primary,
      secondary: report.tokens.secondary,
      accent: report.tokens.accent,
    },
    hasWideTable: maxYears >= 10,
    maxYearColumns: maxYears,
  });
}

export async function applyDesignPass(report: ReportDefinition): Promise<LayoutHints> {
  const maxYears = report.sections
    .filter((s) => s.kind === "table")
    .reduce((max, s) => {
      if (s.kind === "table") return Math.max(max, s.years.length);
      return max;
    }, 0);

  const defaultForReport: LayoutHints = {
    ...DEFAULT_HINTS,
    globalFontSizeScale: maxYears >= 10 ? 0.88 : DEFAULT_HINTS.globalFontSizeScale,
  };

  const manifest = buildManifest(report);

  const prompt = `You are a financial document design expert. Given the structural manifest of a financial PDF report, return a JSON object with layout hints to make it visually premium and investor-grade.

Manifest:
${manifest}

Return ONLY valid JSON matching this exact schema:
{
  "globalFontSizeScale": <number 0.7-1.2, use 0.88 for wide tables with 10+ year columns>,
  "tableDensity": <"cramped" | "comfortable" | "spacious">,
  "chartAreaOpacity": <number 0.1-0.25>,
  "emphasizedKpis": <array of KPI label strings to visually emphasize, max 2>,
  "seriesColors": <empty array [] unless you want to override chart colors>
}

Rules:
- Use "cramped" density for reports with many rows or wide tables
- Use "comfortable" for typical reports
- Use "spacious" for small, executive-summary-style reports
- chartAreaOpacity should be between 0.12 and 0.20
- Respond with JSON only, no explanation`;

  try {
    const client = new Anthropic();

    const raceResult = await Promise.race([
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Design pass timeout")), 4000)
      ),
    ]);

    const content = raceResult.content[0];
    if (content.type !== "text") {
      return defaultForReport;
    }

    const text = content.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return defaultForReport;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = layoutHintsSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn(`[design-pass] Invalid LayoutHints from LLM: ${validated.error.message}`, "pdf");
      return defaultForReport;
    }

    logger.info(`[design-pass] Applied design hints: density=${validated.data.tableDensity}, fontScale=${validated.data.globalFontSizeScale}`, "pdf");
    return validated.data;
  } catch (err: unknown) {
    logger.warn(`[design-pass] Falling back to defaults: ${err instanceof Error ? err.message : String(err)}`, "pdf");
    return defaultForReport;
  }
}
