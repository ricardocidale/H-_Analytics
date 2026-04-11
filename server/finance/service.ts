import { generatePropertyProForma } from "./core/property-pipeline";
import { aggregatePropertyByYear } from "./core/yearly-aggregator";
import { consolidateYearlyFinancials } from "./core/consolidation";
import { validateFinancialIdentities } from "@calc/validation/financial-identities";
import { stableHash } from "../scenarios/stable-json";
import type { PropertyInput, GlobalInput, MonthlyFinancials, CompanyMonthlyFinancials, CompanyYearlyFinancials } from "@engine/types";
import type { ServiceTemplate } from "@calc/services/types";
import type { YearlyPropertyFinancials } from "@engine/aggregation/yearlyAggregator";
import type { PortfolioComputeResult, SinglePropertyComputeResult } from "./core/types";
import { MONTHS_PER_YEAR } from "@shared/constants";
import { generateCompanyProForma } from "@engine/company/company-engine";
import { aggregateCompanyByYear } from "@engine/company/company-yearly-aggregator";
import {
  computeCacheKey,
  getCachedResult,
  setCachedResult,
} from "./cache";
import { AuditCollector } from "@engine/property/audit-collector";
import type { AuditEntry } from "@engine/property/audit-collector";

const ENGINE_VERSION = "1.0.0";
const PROJECTION_YEARS_DEFAULT = 10;
const DEFAULT_ROUNDING = { precision: 2, bankers_rounding: false };

export interface ComputePortfolioInput {
  properties: PropertyInput[];
  globalAssumptions: GlobalInput;
  projectionYears?: number;
  serviceTemplates?: ServiceTemplate[];
}

export interface ComputeSinglePropertyInput {
  property: PropertyInput;
  globalAssumptions: GlobalInput;
  projectionYears?: number;
}

export interface ComputeCompanyInput {
  properties: PropertyInput[];
  globalAssumptions: GlobalInput;
  projectionYears?: number;
  serviceTemplates?: ServiceTemplate[];
}

export interface CompanyComputeResult {
  engineVersion: string;
  computedAt: string;
  companyMonthly: CompanyMonthlyFinancials[];
  companyYearly: CompanyYearlyFinancials[];
  outputHash: string;
  projectionYears: number;
  cached?: boolean;
}

function uniquePropertyKey(property: PropertyInput, index: number): string {
  if (property.id != null) return `property_${property.id}`;
  const name = property.name ?? `Property_${index + 1}`;
  return `${name}__idx${index}`;
}

function runValidation(allPropertyYearlyArrays: YearlyPropertyFinancials[][]) {
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let worstOpinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE" = "UNQUALIFIED";

  for (const yearly of allPropertyYearlyArrays) {
    for (const yearData of yearly) {
      if (yearData.revenueTotal === 0 && yearData.noi === 0) continue;

      const result = validateFinancialIdentities({
        period_label: `Year ${yearData.year + 1}`,
        balance_sheet: {
          total_assets: 0,
          total_liabilities: 0,
          total_equity: 0,
        },
        income_statement: {
          noi: yearData.noi,
          anoi: yearData.anoi,
          interest_expense: yearData.interestExpense,
          depreciation: yearData.depreciationExpense,
          income_tax: yearData.incomeTax,
          net_income: yearData.netIncome,
        },
        cash_flow_statement: {
          operating_cash_flow: yearData.operatingCashFlow,
          financing_cash_flow: yearData.financingCashFlow,
          ending_cash: yearData.endingCash,
          principal_payment: yearData.principalPayment,
          refinancing_proceeds: yearData.refinancingProceeds,
        },
        rounding_policy: DEFAULT_ROUNDING,
      });

      const incomeAndCashChecks = result.checks.filter(
        c => c.identity !== "Balance Sheet Equation"
      );

      totalChecks += incomeAndCashChecks.length;
      passedChecks += incomeAndCashChecks.filter(c => c.passed).length;
      failedChecks += incomeAndCashChecks.filter(c => !c.passed).length;

      const checkOpinion = incomeAndCashChecks.every(c => c.passed)
        ? "UNQUALIFIED"
        : incomeAndCashChecks.some(c => !c.passed && c.severity === "critical")
          ? "ADVERSE"
          : "QUALIFIED";

      if (checkOpinion === "ADVERSE") worstOpinion = "ADVERSE";
      else if (checkOpinion === "QUALIFIED" && worstOpinion !== "ADVERSE") worstOpinion = "QUALIFIED";
    }
  }

  return { opinion: worstOpinion, identityChecks: totalChecks, passed: passedChecks, failed: failedChecks };
}

export interface AuditTrailPerProperty {
  propertyKey: string;
  propertyId: number | null;
  entries: AuditEntry[];
  totalSteps: number;
}

export interface ComputeResultWithAudit {
  result: PortfolioComputeResult;
  auditTrails: AuditTrailPerProperty[];
}

export function computePortfolioProjection(
  input: ComputePortfolioInput,
): PortfolioComputeResult {
  const { result } = computePortfolioProjectionWithAudit(input, false);
  return result;
}

export function computePortfolioProjectionWithAudit(
  input: ComputePortfolioInput,
  collectAudit: boolean,
): ComputeResultWithAudit {
  const cacheKey = computeCacheKey(input);
  if (!collectAudit) {
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return { result: { ...cached, cached: true }, auditTrails: [] };
    }
  }

  const projectionYears = input.projectionYears ?? PROJECTION_YEARS_DEFAULT;
  const months = projectionYears * MONTHS_PER_YEAR;

  const perPropertyYearly: Record<string, YearlyPropertyFinancials[]> = {};
  const perPropertyMonthly: Record<string, MonthlyFinancials[]> = {};
  const auditTrails: AuditTrailPerProperty[] = [];

  for (let i = 0; i < input.properties.length; i++) {
    const property = input.properties[i];
    const key = uniquePropertyKey(property, i);

    const monthly = generatePropertyProForma(property, input.globalAssumptions, months);
    const yearly = aggregatePropertyByYear(monthly, projectionYears);

    perPropertyMonthly[key] = monthly;
    perPropertyYearly[key] = yearly;

    if (collectAudit) {
      const collector = new AuditCollector();
      const propName = property.name ?? key;
      collector.collectFromMonthly(monthly, propName);
      collector.collectFromYearly(yearly, propName);
      auditTrails.push({
        propertyKey: key,
        propertyId: property.id ?? null,
        entries: collector.getEntries(),
        totalSteps: collector.totalSteps,
      });
    }
  }

  const allPropertyYearlyArrays = Object.values(perPropertyYearly);
  const consolidatedYearly = consolidateYearlyFinancials(allPropertyYearlyArrays, projectionYears);

  const validationSummary = runValidation(allPropertyYearlyArrays);

  const companyMonthly = generateCompanyProForma(input.properties, input.globalAssumptions, months, input.serviceTemplates);
  const companyYearly = aggregateCompanyByYear(companyMonthly, projectionYears);

  const outputPayload = { perPropertyYearly, perPropertyMonthly, consolidatedYearly, companyMonthly, companyYearly };
  const outputHash = stableHash(outputPayload);

  const result: PortfolioComputeResult = {
    engineVersion: ENGINE_VERSION,
    computedAt: new Date().toISOString(),
    perPropertyYearly,
    perPropertyMonthly,
    consolidatedYearly,
    companyMonthly,
    companyYearly,
    outputHash,
    propertyCount: input.properties.length,
    projectionYears,
    validationSummary,
  };

  setCachedResult(cacheKey, result);
  return { result, auditTrails };
}

export function computeSingleProperty(
  input: ComputeSinglePropertyInput,
): SinglePropertyComputeResult {
  const cacheKey = computeCacheKey({ type: "single-property", ...input });
  const cached = getCachedResult(cacheKey);
  if (cached) {
    const key = Object.keys(cached.perPropertyYearly)[0];
    return {
      engineVersion: cached.engineVersion,
      computedAt: cached.computedAt,
      monthly: cached.perPropertyMonthly[key] ?? [],
      yearly: cached.perPropertyYearly[key] ?? [],
      outputHash: cached.outputHash,
      projectionYears: cached.projectionYears,
      cached: true,
      validationSummary: cached.validationSummary,
    };
  }

  const projectionYears = input.projectionYears ?? PROJECTION_YEARS_DEFAULT;
  const months = projectionYears * MONTHS_PER_YEAR;

  const monthly = generatePropertyProForma(input.property, input.globalAssumptions, months);
  const yearly = aggregatePropertyByYear(monthly, projectionYears);

  const validationSummary = runValidation([yearly]);

  const outputHash = stableHash({ monthly, yearly });

  const result: SinglePropertyComputeResult = {
    engineVersion: ENGINE_VERSION,
    computedAt: new Date().toISOString(),
    monthly,
    yearly,
    outputHash,
    projectionYears,
    validationSummary,
  };

  const key = uniquePropertyKey(input.property, 0);
  const portfolioResult: PortfolioComputeResult = {
    engineVersion: ENGINE_VERSION,
    computedAt: result.computedAt,
    perPropertyYearly: { [key]: yearly },
    perPropertyMonthly: { [key]: monthly },
    consolidatedYearly: yearly,
    outputHash: result.outputHash,
    propertyCount: 1,
    projectionYears,
    validationSummary,
  };
  setCachedResult(cacheKey, portfolioResult);

  return result;
}

export function computeCompanyProjection(
  input: ComputeCompanyInput,
): CompanyComputeResult {
  const cacheKey = computeCacheKey({ type: "company", ...input });
  const cached = getCachedResult(cacheKey);
  if (cached && cached.companyMonthly && cached.companyYearly) {
    return {
      engineVersion: cached.engineVersion,
      computedAt: cached.computedAt,
      companyMonthly: cached.companyMonthly,
      companyYearly: cached.companyYearly,
      outputHash: cached.outputHash,
      projectionYears: cached.projectionYears,
      cached: true,
    };
  }

  const projectionYears = input.projectionYears ?? PROJECTION_YEARS_DEFAULT;
  const months = projectionYears * MONTHS_PER_YEAR;

  const companyMonthly = generateCompanyProForma(
    input.properties,
    input.globalAssumptions,
    months,
    input.serviceTemplates,
  );
  const companyYearly = aggregateCompanyByYear(companyMonthly, projectionYears);

  const outputHash = stableHash({ companyMonthly, companyYearly });

  const result: CompanyComputeResult = {
    engineVersion: ENGINE_VERSION,
    computedAt: new Date().toISOString(),
    companyMonthly,
    companyYearly,
    outputHash,
    projectionYears,
  };

  setCachedResult(cacheKey, {
    engineVersion: result.engineVersion,
    computedAt: result.computedAt,
    perPropertyYearly: {},
    perPropertyMonthly: {},
    consolidatedYearly: [],
    companyMonthly,
    companyYearly,
    outputHash,
    propertyCount: input.properties.length,
    projectionYears,
    validationSummary: { opinion: "UNQUALIFIED", identityChecks: 0, passed: 0, failed: 0 },
  });

  return result;
}
