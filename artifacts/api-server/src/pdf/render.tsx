import React from "react";
import { Document, Page, View, Text, Image, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReportDefinition } from "../report/types";
import { compileReport, type CompileInput } from "../report/compiler";
import { logger } from "../logger";
import { applyDesignPass, DEFAULT_HINTS } from "./design-pass";
import { tokensToTheme, PAGE_LANDSCAPE, PAGE_PORTRAIT, PageHeader, PageFooter } from "./theme-mappers";
import { groupSectionsIntoPages } from "./pagination";
import { KpiCards, renderDenseSectionContent } from "./section-renderers";
import { FinancialTable } from "./table-render";
import { LineChart } from "./chart-render";

export async function renderPremiumPdf(input: ReportDefinition | CompileInput): Promise<Buffer> {
  let report: ReportDefinition;
  if ("tokens" in input && "sections" in input && "cover" in input) {
    report = input as ReportDefinition;
  } else {
    report = compileReport(input as CompileInput);
  }

  const hints = await applyDesignPass(report).catch(() => DEFAULT_HINTS);

  const theme = tokensToTheme(report.tokens);
  const { cover, orientation, sections } = report;
  const isLandscape = orientation === "landscape";
  const dense = report.densePagination !== false;

  logger.info(`[react-pdf] Building ${sections.length} sections (landscape=${isLandscape}, density=${hints.tableDensity}, fontScale=${hints.globalFontSizeScale}, dense=${dense})`, "premium-export");

  const pageSize: [number, number] = isLandscape ? PAGE_LANDSCAPE : PAGE_PORTRAIT;
  const pageStyle = { paddingTop: 10, paddingHorizontal: isLandscape ? 60 : 50, paddingBottom: 30, backgroundColor: theme.white };

  const buildDocument = (): React.ReactElement<DocumentProps> => {
    if (dense && sections.length > 0) {
      const pageGroups = groupSectionsIntoPages(sections, isLandscape, hints);

      return (
        <Document title={cover.reportTitle} author={cover.companyName} subject="Financial Report" creator="H+ Analytics">
          {pageGroups.map((group, pageIdx) => (
            <Page key={`page-${pageIdx}`} size={pageSize} style={pageStyle}>
              <PageHeader title={cover.reportTitle} companyName={cover.companyName} entityName={cover.entityName} theme={theme} />
              {group.map((section, secIdx) => renderDenseSectionContent(section, pageIdx * 100 + secIdx, theme, isLandscape, hints))}
              <PageFooter companyName={cover.companyName} theme={theme} />
            </Page>
          ))}
        </Document>
      );
    }

    return (
      <Document title={cover.reportTitle} author={cover.companyName} subject="Financial Report" creator="H+ Analytics">
        {sections.map((section, i) => {
          switch (section.kind) {
            case "kpi":
              return (
                <KpiCards
                  key={`kpi-${i}`}
                  title={section.title}
                  metrics={section.metrics}
                  companyName={cover.companyName}
                  entityName={cover.entityName}
                  theme={theme}
                  isLandscape={isLandscape}
                  hints={hints}
                />
              );
            case "table":
              return (
                <FinancialTable
                  key={`table-${i}`}
                  title={section.title}
                  years={section.years}
                  rows={section.rows}
                  companyName={cover.companyName}
                  entityName={cover.entityName}
                  theme={theme}
                  isLandscape={isLandscape}
                  hints={hints}
                />
              );
            case "chart":
              return (
                <LineChart
                  key={`chart-${i}`}
                  title={section.title}
                  series={section.series}
                  years={section.years}
                  companyName={cover.companyName}
                  entityName={cover.entityName}
                  theme={theme}
                  isLandscape={isLandscape}
                  hints={hints}
                />
              );
            case "image":
              if (!section.dataUrl) return null;
              return (
                <Page key={`image-${i}`} size={pageSize} style={pageStyle}>
                  <PageHeader title={section.title} companyName={cover.companyName} entityName={cover.entityName} theme={theme} />
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 4 }}>
                    <Image src={section.dataUrl} style={{ width: "96%", objectFit: "contain" }} />
                  </View>
                  <PageFooter companyName={cover.companyName} theme={theme} />
                </Page>
              );
            default:
              return null;
          }
        })}

        {sections.length === 0 && (
          <Page size={pageSize} style={pageStyle}>
            <PageHeader title="Financial Report" companyName={cover.companyName} entityName={cover.entityName} theme={theme} />
            <Text style={{ fontSize: 10, color: theme.border, textAlign: "center", paddingTop: 80 }}>No financial data available for export.</Text>
            <PageFooter companyName={cover.companyName} theme={theme} />
          </Page>
        )}
      </Document>
    );
  };

  const buffer = await renderToBuffer(buildDocument());
  logger.info(`[react-pdf] Rendered ${buffer.length} bytes`, "premium-export");
  return Buffer.from(buffer);
}
