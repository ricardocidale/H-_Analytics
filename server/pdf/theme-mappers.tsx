import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { type PdfTheme } from "./theme";
import type { DesignTokens } from "../report/types";

export const MM_TO_PT = 2.83465;
export const PAGE_LANDSCAPE: [number, number] = [406.4 * MM_TO_PT, 228.6 * MM_TO_PT];
export const PAGE_PORTRAIT: [number, number] = [215.9 * MM_TO_PT, 279.4 * MM_TO_PT];

export function tokensToTheme(t: DesignTokens): PdfTheme {
  return {
    primary: t.primary,
    secondary: t.secondary,
    accent: t.accent,
    foreground: t.foreground,
    border: t.border,
    muted: t.muted,
    surface: t.surface,
    background: t.background,
    white: t.white,
    negativeRed: t.negativeRed,
    chart: t.chart,
    line: t.line,
  };
}

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
