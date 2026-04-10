import React from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import { type PdfTheme } from "./theme";
import type { ReportSection } from "../report/types";
import type { LayoutHints } from "./design-pass";
import { SECTION_GAP } from "./pagination";
import { TableBody } from "./table-render";
import { ChartSvgBody } from "./chart-render";

export function PageHeader({ title, companyName, entityName, theme }: { title: string; companyName: string; entityName: string; theme: PdfTheme }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ backgroundColor: theme.primary, padding: "12 20 10 20", borderBottomLeftRadius: 6, borderBottomRightRadius: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: theme.white, fontFamily: "Helvetica-Bold" }}>{title}</Text>
          <Text style={{ fontSize: 7.5, color: theme.muted, marginTop: 2 }}>{companyName} — {entityName}</Text>
        </View>
        <Text style={{ fontSize: 7, color: theme.secondary, fontWeight: "bold", fontFamily: "Helvetica-Bold" }}>{companyName}</Text>
      </View>
    </View>
  );
}

export function PageFooter({ companyName, theme }: { companyName: string; theme: PdfTheme }) {
  return (
    <View style={{ position: "absolute", bottom: 12, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" }} fixed>
      <Text style={{ fontSize: 6, color: theme.border }}>{companyName}</Text>
      <Text style={{ fontSize: 6, color: theme.border }}>CONFIDENTIAL</Text>
      <Text style={{ fontSize: 6, color: theme.border }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function SectionDivider({ title, theme }: { title: string; theme: PdfTheme }) {
  return (
    <View style={{ backgroundColor: theme.primary, padding: "6 12 5 12", borderRadius: 4, marginBottom: 10, marginTop: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: theme.white }}>{title}</Text>
    </View>
  );
}

export function KpiCards({ title, metrics, companyName, entityName, theme, isLandscape, hints }: {
  title: string;
  metrics: Array<{ label: string; value: string; description?: string }>;
  companyName: string;
  entityName: string;
  theme: PdfTheme;
  isLandscape: boolean;
  hints: LayoutHints;
}) {
  const pageSize: [number, number] = isLandscape
    ? [406.4 * 2.83465, 228.6 * 2.83465]
    : [215.9 * 2.83465, 279.4 * 2.83465];
  const cols = isLandscape ? 3 : 2;

  const rows: Array<typeof metrics> = [];
  for (let i = 0; i < metrics.length; i += cols) {
    rows.push(metrics.slice(i, i + cols));
  }

  const Page = require("@react-pdf/renderer").Page;
  return (
    <Page size={pageSize} style={{ paddingTop: 10, paddingHorizontal: isLandscape ? 60 : 50, paddingBottom: 30, backgroundColor: theme.white }}>
      <PageHeader title={title} companyName={companyName} entityName={entityName} theme={theme} />
      <View style={{ flexDirection: "column", gap: 12 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", gap: 12 }}>
            {row.map((m, mi) => {
              const isEmphasized = hints.emphasizedKpis.includes(m.label);
              const valueColor = isEmphasized ? theme.accent : theme.primary;
              const borderWidth = isEmphasized ? 4 : 3;
              return (
                <View key={mi} style={{ flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 7, overflow: "hidden", flexDirection: "row" }}>
                  <View style={{ width: borderWidth, backgroundColor: theme.accent }} />
                  <View style={{ flex: 1, padding: "16 14 18 14", alignItems: "center" }}>
                    <Text style={{ fontSize: Math.round(28 * hints.globalFontSizeScale), fontWeight: "bold", fontFamily: "Helvetica-Bold", color: valueColor, marginBottom: 5 }}>{m.value}</Text>
                    <Text style={{ fontSize: 8.5, color: theme.foreground, fontWeight: "bold", fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 }}>{m.label}</Text>
                    {m.description ? <Text style={{ fontSize: 6.5, color: theme.border, textAlign: "center" }}>{m.description}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <PageFooter companyName={companyName} theme={theme} />
    </Page>
  );
}

export function renderDenseSectionContent(section: ReportSection, index: number, theme: PdfTheme, isLandscape: boolean, hints: LayoutHints): React.ReactElement | null {
  switch (section.kind) {
    case "kpi": {
      const cols = isLandscape ? 3 : 2;
      const rows: Array<typeof section.metrics> = [];
      for (let i = 0; i < section.metrics.length; i += cols) {
        rows.push(section.metrics.slice(i, i + cols));
      }
      return (
        <View key={`kpi-${index}`} wrap={false} style={{ marginBottom: SECTION_GAP }}>
          <SectionDivider title={section.title} theme={theme} />
          <View style={{ flexDirection: "column", gap: 12 }}>
            {rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: "row", gap: 12 }}>
                {row.map((m, mi) => {
                  const isEmphasized = hints.emphasizedKpis.includes(m.label);
                  const valueColor = isEmphasized ? theme.accent : theme.primary;
                  const borderWidth = isEmphasized ? 4 : 3;
                  return (
                    <View key={mi} style={{ flex: 1, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 7, overflow: "hidden", flexDirection: "row" }}>
                      <View style={{ width: borderWidth, backgroundColor: theme.accent }} />
                      <View style={{ flex: 1, padding: "16 14 18 14", alignItems: "center" }}>
                        <Text style={{ fontSize: Math.round(28 * hints.globalFontSizeScale), fontWeight: "bold", fontFamily: "Helvetica-Bold", color: valueColor, marginBottom: 5 }}>{m.value}</Text>
                        <Text style={{ fontSize: 8.5, color: theme.foreground, fontWeight: "bold", fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 }}>{m.label}</Text>
                        {m.description ? <Text style={{ fontSize: 6.5, color: theme.border, textAlign: "center" }}>{m.description}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      );
    }
    case "table": {
      if (!section.years.length || !section.rows.length) {
        return (
          <View key={`table-${index}`} style={{ marginBottom: SECTION_GAP }}>
            <SectionDivider title={section.title} theme={theme} />
            <Text style={{ fontSize: 10, color: theme.border, textAlign: "center", paddingTop: 20 }}>No financial data available for this section.</Text>
          </View>
        );
      }
      return (
        <View key={`table-${index}`} wrap={false} style={{ marginBottom: SECTION_GAP }}>
          <SectionDivider title={section.title} theme={theme} />
          <TableBody years={section.years} rows={section.rows} theme={theme} isLandscape={isLandscape} hints={hints} />
        </View>
      );
    }
    case "chart": {
      if (!section.series.length || !section.years.length) return null;
      return (
        <View key={`chart-${index}`} wrap={false} style={{ marginBottom: SECTION_GAP }}>
          <SectionDivider title={section.title} theme={theme} />
          <ChartSvgBody series={section.series} years={section.years} theme={theme} isLandscape={isLandscape} hints={hints} />
        </View>
      );
    }
    case "image": {
      if (!section.dataUrl) return null;
      return (
        <View key={`image-${index}`} wrap={false} style={{ marginBottom: SECTION_GAP }}>
          <SectionDivider title={section.title} theme={theme} />
          <View style={{ alignItems: "center", paddingVertical: 8, paddingHorizontal: 4 }}>
            <Image src={section.dataUrl} style={{ width: "96%", objectFit: "contain" }} />
          </View>
        </View>
      );
    }
    default:
      return null;
  }
}
