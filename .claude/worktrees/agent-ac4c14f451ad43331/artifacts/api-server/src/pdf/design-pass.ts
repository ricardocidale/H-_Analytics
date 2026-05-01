import { logger } from "../logger";
import type { ReportDefinition } from "../report/types";

export interface LayoutHints {
  globalFontSizeScale: number;
  tableDensity: "cramped" | "comfortable" | "spacious";
  chartAreaOpacity: number;
  emphasizedKpis: string[];
  seriesColors: string[];
}

export const DEFAULT_HINTS: LayoutHints = {
  globalFontSizeScale: 1.1,
  tableDensity: "comfortable",
  chartAreaOpacity: 0.15,
  emphasizedKpis: [],
  seriesColors: [],
};

export async function applyDesignPass(report: ReportDefinition): Promise<LayoutHints> {
  // Deterministic design pass — instant, no LLM API call.
  // Same logic the LLM was asked to apply, encoded as rules.
  // The LLM design pass can be restored as an offline admin tool later.
  const maxYears = report.sections
    .filter((s) => s.kind === "table")
    .reduce((max, s) => {
      if (s.kind === "table") return Math.max(max, s.years.length);
      return max;
    }, 0);

  const totalRows = report.sections
    .filter((s) => s.kind === "table")
    .reduce((sum, s) => sum + (s.kind === "table" ? s.rows.length : 0), 0);

  const isWide = maxYears >= 10;
  const isDense = totalRows > 80 || report.sections.length > 8;

  const defaultForReport: LayoutHints = {
    ...DEFAULT_HINTS,
    globalFontSizeScale: maxYears >= 10 ? 0.88 : DEFAULT_HINTS.globalFontSizeScale,
  };

  // Deterministic rules — same logic the LLM was applying
  const hints: LayoutHints = {
    globalFontSizeScale: isWide ? 0.85 : isDense ? 0.95 : defaultForReport.globalFontSizeScale,
    tableDensity: isWide || isDense ? "cramped" : "comfortable",
    chartAreaOpacity: 0.15,
    emphasizedKpis: [],
    seriesColors: [],
  };

  logger.info(`[design-pass] Applied (deterministic): density=${hints.tableDensity}, fontScale=${hints.globalFontSizeScale}, years=${maxYears}, rows=${totalRows}`, "pdf");
  return hints;
}
