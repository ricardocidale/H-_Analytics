/**
 * server/ai/executive-summary/types.ts — Public interfaces for the
 * executive summary generator. Split out of executive-summary.ts so the
 * underlying generator helpers can import the shapes without pulling in
 * the orchestrator.
 */

export interface PropertyExecutiveSummary {
  propertyName: string;
  propertyId: number;
  generatedAt: string;

  investmentThesis: string;

  keyMetrics: {
    totalInvestment: number;
    projectedIRR: number;
    equityMultiple: number;
    stabilizedNOI: number;
    exitValue: number;
    dscr: number | null;
    cashOnCash: number;
    paybackYears: number;
  };

  marketPosition: string;
  revenueStrategy: string;
  riskFactors: string;
  mitigants: string;
  exitStrategy: string;

  comparableData: string;
  confidenceLevel: string;
  sources: string[];
}

export interface PortfolioExecutiveSummary {
  generatedAt: string;

  portfolioThesis: string;

  totalProperties: number;
  totalInvestment: number;
  weightedIRR: number;
  portfolioRiskGrade: string;
  geographicSpread: string;

  brandStrategy: string;
  diversificationAnalysis: string;
  growthPlan: string;
  managementCompanyValue: string;

  propertySummaries: Array<{
    name: string;
    irr: number;
    riskGrade: string;
    oneLiner: string;
  }>;

  sources: string[];
}

export interface ExecutiveSummaryOptions {
  /** Enable LLM-enhanced qualitative narratives (default: true) */
  includeLLM?: boolean;
  /** Format: 'json' returns structured object, 'text' returns plain text for export embedding */
  format?: "json" | "text";
}

export interface PropertyQualitativeSections {
  investmentThesis: string;
  marketPosition: string;
  revenueStrategy: string;
  riskFactors: string;
  mitigants: string;
  exitStrategy: string;
}

export interface PortfolioQualitativeSections {
  portfolioThesis: string;
  brandStrategy: string;
  diversificationAnalysis: string;
  growthPlan: string;
  managementCompanyValue: string;
}
