import type { ReportSection, ImageSection } from "../report/types";
import type { LayoutHints } from "./design-pass";
import { PAGE_LANDSCAPE, PAGE_PORTRAIT } from "./theme-mappers";

export const HEADER_HEIGHT_PT = 50;
export const FOOTER_HEIGHT_PT = 30;
export const PAGE_PADDING_TOP = 10;
export const PAGE_PADDING_BOTTOM = 30;
export const SECTION_GAP = 16;

export function estimateSectionHeight(section: ReportSection, isLandscape: boolean, hints: LayoutHints): number {
  const dividerHeight = 30;
  switch (section.kind) {
    case "kpi": {
      const cols = isLandscape ? 3 : 2;
      const rowCount = Math.ceil(section.metrics.length / cols);
      return dividerHeight + rowCount * 90;
    }
    case "table": {
      const rowHeight = hints.tableDensity === "cramped" ? 18 : hints.tableDensity === "spacious" ? 26 : 22;
      const headerRowHeight = 28;
      return dividerHeight + headerRowHeight + section.rows.length * rowHeight;
    }
    case "chart": {
      const chartHeight = isLandscape ? 340 : 400;
      return dividerHeight + chartHeight;
    }
    case "image": {
      const ar = (section as ImageSection).aspectRatio ?? (16 / 9);
      const imgW = isLandscape ? 900 : 500;
      return dividerHeight + imgW / ar + 10;
    }
    default:
      return 200;
  }
}

export function splitOversizedSections(sections: ReportSection[], isLandscape: boolean, hints: LayoutHints): ReportSection[] {
  const pageHeight = isLandscape ? PAGE_LANDSCAPE[1] : PAGE_PORTRAIT[1];
  const usable = pageHeight - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM - HEADER_HEIGHT_PT - FOOTER_HEIGHT_PT;
  const result: ReportSection[] = [];

  for (const section of sections) {
    if (section.kind !== "table") {
      result.push(section);
      continue;
    }

    const sectionH = estimateSectionHeight(section, isLandscape, hints);
    if (sectionH <= usable) {
      result.push(section);
      continue;
    }

    const rowHeight = hints.tableDensity === "cramped" ? 18 : hints.tableDensity === "spacious" ? 26 : 22;
    const dividerHeight = 30;
    const headerRowHeight = 28;
    const overhead = dividerHeight + headerRowHeight;
    const maxRowsPerChunk = Math.max(1, Math.floor((usable - overhead) / rowHeight));
    const totalRows = section.rows;

    for (let offset = 0; offset < totalRows.length; offset += maxRowsPerChunk) {
      const chunk = totalRows.slice(offset, offset + maxRowsPerChunk);
      const suffix = offset === 0 ? "" : " (cont'd)";
      result.push({
        kind: "table",
        title: section.title + suffix,
        years: section.years,
        rows: chunk,
      });
    }
  }

  return result;
}

export function groupSectionsIntoPages(sections: ReportSection[], isLandscape: boolean, hints: LayoutHints): ReportSection[][] {
  const normalized = splitOversizedSections(sections, isLandscape, hints);
  const pageHeight = isLandscape ? PAGE_LANDSCAPE[1] : PAGE_PORTRAIT[1];
  const usable = pageHeight - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM - HEADER_HEIGHT_PT - FOOTER_HEIGHT_PT;

  const pages: ReportSection[][] = [];
  let currentPage: ReportSection[] = [];
  let currentHeight = 0;

  for (const section of normalized) {
    const sectionH = estimateSectionHeight(section, isLandscape, hints);

    if (currentPage.length > 0 && currentHeight + SECTION_GAP + sectionH > usable) {
      pages.push(currentPage);
      currentPage = [section];
      currentHeight = sectionH;
    } else {
      if (currentPage.length > 0) currentHeight += SECTION_GAP;
      currentPage.push(section);
      currentHeight += sectionH;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}
