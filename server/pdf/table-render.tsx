import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { type PdfTheme } from "./theme";
import type { TableRow as IRTableRow } from "../report/types";
import type { LayoutHints } from "./design-pass";
import { PAGE_LANDSCAPE, PAGE_PORTRAIT } from "./theme-mappers";
import { PageHeader, PageFooter } from "./section-renderers";

export const DENSITY_PADDING: Record<string, string> = {
  cramped: "3 6",
  comfortable: "6 10",
  spacious: "8 12",
};

interface TableRenderProps {
  years: string[];
  rows: IRTableRow[];
  theme: PdfTheme;
  isLandscape: boolean;
  hints: LayoutHints;
}

export function TableBody({ years, rows, theme, isLandscape, hints }: TableRenderProps) {
  const colWidth = isLandscape
    ? (PAGE_LANDSCAPE[0] - 120 - 140) / Math.max(years.length, 1)
    : (PAGE_PORTRAIT[0] - 100 - 110) / Math.max(years.length, 1);
  const labelWidth = isLandscape ? 140 : 110;
  const dataFontSize = Math.round(11 * hints.globalFontSizeScale);
  const headerFontSize = Math.round(12 * hints.globalFontSizeScale);
  const cellPadding = DENSITY_PADDING[hints.tableDensity] || "6 10";

  return (
    <View style={{ borderWidth: 0.25, borderColor: theme.foreground, borderRadius: 4, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", backgroundColor: theme.surface, borderBottomWidth: 0.75, borderBottomColor: theme.foreground }}>
        <View style={{ width: labelWidth, padding: "6 8" }}>
          <Text style={{ fontSize: headerFontSize, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: theme.primary }}> </Text>
        </View>
        {years.map((yr, i) => (
          <View key={i} style={{ width: colWidth, padding: "6 4", alignItems: "flex-end" }}>
            <Text style={{ fontSize: headerFontSize, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: theme.primary }}>FY {yr}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, idx) => {
        const isHeader = row.type === "header";
        const isTotal = row.type === "total" || row.type === "subtotal";
        const category = (row.category || "").trim();

        if (!category && row.values.every((fv) => {
          const r = fv.raw;
          return r === 0 || r === null || r === "";
        })) {
          return <View key={idx} style={{ height: 8 }} />;
        }

        const bgColor = isHeader
          ? theme.surface
          : isTotal
            ? theme.surface
            : idx % 2 === 0
              ? theme.muted
              : theme.white;
        const borderTop = isHeader
          ? { borderTopWidth: 0.5, borderTopColor: theme.foreground }
          : isTotal
            ? { borderTopWidth: 0.5, borderTopColor: theme.foreground }
            : {};

        const rowFontSize = (isHeader || isTotal) ? headerFontSize : dataFontSize;

        const allZero = row.values.every((fv) => {
          const r = fv.raw;
          return r === 0 || r === null || r === "";
        });

        return (
          <View key={idx} style={{ flexDirection: "row", backgroundColor: bgColor, ...borderTop }}>
            <View style={{ width: labelWidth, padding: cellPadding, paddingLeft: 8 + row.indent * 10 }}>
              <Text style={{
                fontSize: rowFontSize,
                fontWeight: isHeader || isTotal ? "bold" : "normal",
                fontFamily: isHeader || isTotal ? "Helvetica-Bold" : "Helvetica",
                color: isHeader || isTotal ? theme.primary : theme.foreground,
              }}>{category}</Text>
            </View>
            {row.values.map((fv, vi) => {
              const displayText = allZero && isHeader ? "" : fv.text;
              return (
                <View key={vi} style={{ width: colWidth, padding: cellPadding, alignItems: "flex-end" }}>
                  <Text style={{
                    fontSize: rowFontSize,
                    fontWeight: isHeader || isTotal ? "bold" : "normal",
                    fontFamily: isHeader || isTotal ? "Helvetica-Bold" : "Courier",
                    color: fv.negative ? theme.negativeRed : theme.foreground,
                  }}>{displayText}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

export function FinancialTable({ title, years, rows, companyName, entityName, theme, isLandscape, hints }: {
  title: string;
  years: string[];
  rows: IRTableRow[];
  companyName: string;
  entityName: string;
  theme: PdfTheme;
  isLandscape: boolean;
  hints: LayoutHints;
}) {
  const pageSize: [number, number] = isLandscape ? PAGE_LANDSCAPE : PAGE_PORTRAIT;

  if (!years.length || !rows.length) {
    return (
      <Page size={pageSize} style={{ paddingTop: 10, paddingHorizontal: isLandscape ? 60 : 50, paddingBottom: 30, backgroundColor: theme.white }}>
        <PageHeader title={title} companyName={companyName} entityName={entityName} theme={theme} />
        <Text style={{ fontSize: 10, color: theme.border, textAlign: "center", paddingTop: 80 }}>No financial data available for this section.</Text>
        <PageFooter companyName={companyName} theme={theme} />
      </Page>
    );
  }

  return (
    <Page size={pageSize} style={{ paddingTop: 10, paddingHorizontal: isLandscape ? 60 : 50, paddingBottom: 30, backgroundColor: theme.white }}>
      <PageHeader title={title} companyName={companyName} entityName={entityName} theme={theme} />
      <TableBody years={years} rows={rows} theme={theme} isLandscape={isLandscape} hints={hints} />
      <PageFooter companyName={companyName} theme={theme} />
    </Page>
  );
}
