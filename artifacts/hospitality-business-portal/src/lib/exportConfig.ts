export interface ExportConfig {
  overview: {
    allowLandscape: boolean;
    allowPortrait: boolean;
    allowShort: boolean;
    allowExtended: boolean;
    allowPremium: boolean;
    densePagination: boolean;
    kpiMetrics: boolean;
    revenueChart: boolean;
    projectionTable: boolean;
    compositionTables: boolean;
    compositionCharts: boolean;
    waterfallTable: boolean;
    propertyInsights: boolean;
    aiInsights: boolean;
  };

  statements: {
    allowLandscape: boolean;
    allowPortrait: boolean;
    allowShort: boolean;
    allowExtended: boolean;
    allowPremium: boolean;
    densePagination: boolean;
    incomeStatement: boolean;
    incomeChart: boolean;
    cashFlow: boolean;
    cashFlowChart: boolean;
    balanceSheet: boolean;
    balanceSheetChart: boolean;
  };

  analysis: {
    allowLandscape: boolean;
    allowPortrait: boolean;
    allowShort: boolean;
    allowExtended: boolean;
    allowPremium: boolean;
    densePagination: boolean;
    kpiSummaryCards: boolean;
    returnChart: boolean;
    freeCashFlowTable: boolean;
    propertyIrrTable: boolean;
    dcfAnalysis: boolean;
    performanceTrend: boolean;
  };
}

const FORMAT_DEFAULTS = {
  allowLandscape: true,
  allowPortrait: true,
  allowShort: true,
  allowExtended: true,
  allowPremium: true,
  densePagination: true,
};

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  overview: {
    ...FORMAT_DEFAULTS,
    kpiMetrics: true,
    revenueChart: true,
    projectionTable: true,
    compositionTables: true,
    compositionCharts: true,
    waterfallTable: true,
    propertyInsights: true,
    aiInsights: true,
  },

  statements: {
    ...FORMAT_DEFAULTS,
    incomeStatement: true,
    incomeChart: true,
    cashFlow: true,
    cashFlowChart: true,
    balanceSheet: true,
    balanceSheetChart: true,
  },

  analysis: {
    ...FORMAT_DEFAULTS,
    kpiSummaryCards: true,
    returnChart: true,
    freeCashFlowTable: true,
    propertyIrrTable: true,
    dcfAnalysis: true,
    performanceTrend: true,
  },
};

const STORAGE_KEY = "hplus-export-config";

export function loadExportConfig(): ExportConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EXPORT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ExportConfig>;
    return {
      overview: { ...DEFAULT_EXPORT_CONFIG.overview, ...(parsed.overview ?? {}) },
      statements: { ...DEFAULT_EXPORT_CONFIG.statements, ...(parsed.statements ?? {}) },
      analysis: { ...DEFAULT_EXPORT_CONFIG.analysis, ...(parsed.analysis ?? {}) },
    };
  } catch {
    return DEFAULT_EXPORT_CONFIG;
  }
}

export function saveExportConfig(config: ExportConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}
