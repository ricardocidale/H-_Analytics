/**
 * Unit tests for assumption-sections.ts — section builder helpers.
 *
 * Task #1648: Expand the report test suite beyond otavio-pagination.
 * Covers:
 *   - ASSUMPTIONS_TITLE_PREFIX constant value (load-bearing contract)
 *   - buildCompanyAssumptionsSection: title, years, includeTable/Chart flags,
 *     mandatory header groups, row structure, fallback company name,
 *     conditional rows (refi fields, exitRevenueMultiple, companyInflationRate)
 */

import { describe, it, expect } from 'vitest';
import {
  ASSUMPTIONS_TITLE_PREFIX,
  buildCompanyAssumptionsSection,
} from './assumption-sections';

// ─── ASSUMPTIONS_TITLE_PREFIX contract ───────────────────────────────────────

describe('ASSUMPTIONS_TITLE_PREFIX', () => {
  it('equals "Assumptions — " (the load-bearing routing contract)', () => {
    expect(ASSUMPTIONS_TITLE_PREFIX).toBe('Assumptions — ');
  });

  it('ends with a space after the em dash', () => {
    // Consumers rely on the trailing space when appending entity names.
    expect(ASSUMPTIONS_TITLE_PREFIX.endsWith(' ')).toBe(true);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal global-assumptions record that satisfies all mandatory rows. */
function baseGlobals(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companyName: 'Acme Hospitality',
    propertyLabel: 'Hotel',
    modelStartDate: '2025-01-01',
    companyOpsStartDate: '2025-03-01',
    projectionYears: 5,
    fiscalYearStartMonth: 1,
    inflationRate: 0.03,
    fixedCostEscalationRate: 0.025,
    baseManagementFee: 0.03,
    incentiveManagementFee: 0.10,
    fundingSourceLabel: 'SAFE',
    capitalRaise1Amount: 2_000_000,
    capitalRaise1Date: '2025-01-01',
    capitalRaise2Amount: 0,
    capitalRaise2Date: null,
    capitalRaiseValuationCap: 10_000_000,
    capitalRaiseDiscountRate: 0.20,
    fundingInterestRate: 0.06,
    fundingInterestPaymentFrequency: 'quarterly',
    staffSalary: 80_000,
    staffTier1MaxProperties: 3,
    staffTier1Fte: 2,
    staffTier2MaxProperties: 7,
    staffTier2Fte: 4,
    staffTier3Fte: 6,
    officeLeaseStart: 24_000,
    professionalServicesStart: 12_000,
    techInfraStart: 8_000,
    businessInsuranceStart: 6_000,
    travelCostPerClient: 1_500,
    itLicensePerClient: 500,
    marketingRate: 0.02,
    miscOpsRate: 0.01,
    companyTaxRate: 0.21,
    costOfEquity: 0.12,
    commissionRate: 0.015,
    depreciationYears: 39,
    exitCapRate: 0.065,
    salesCommissionRate: 0.05,
    standardAcqPackage: {
      purchasePrice: 3_000_000,
      buildingImprovements: 500_000,
      preOpeningCosts: 100_000,
      operatingReserve: 200_000,
      monthsToOps: 6,
    },
    debtAssumptions: {
      acqLTV: 0.65,
      acqClosingCostRate: 0.015,
      interestRate: 0.055,
      amortizationYears: 25,
      refiLTV: 0.70,
      refiClosingCostRate: 0.01,
    },
    ...overrides,
  };
}

// ─── buildCompanyAssumptionsSection — section metadata ───────────────────────

describe('buildCompanyAssumptionsSection — section metadata', () => {
  it('title is ASSUMPTIONS_TITLE_PREFIX + companyName', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    expect(section.title).toBe('Assumptions — Acme Hospitality');
  });

  it('title starts with ASSUMPTIONS_TITLE_PREFIX', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    expect(section.title.startsWith(ASSUMPTIONS_TITLE_PREFIX)).toBe(true);
  });

  it('years is ["Value"] (single-column assumption table)', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    expect(section.years).toEqual(['Value']);
  });

  it('includeTable is true', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    expect(section.includeTable).toBe(true);
  });

  it('includeChart is false', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    expect(section.includeChart).toBe(false);
  });
});

describe('buildCompanyAssumptionsSection — fallback company name', () => {
  it('falls back to "Management Company" when companyName is absent', () => {
    const g = baseGlobals();
    delete g.companyName;
    const section = buildCompanyAssumptionsSection(g);
    expect(section.title).toBe('Assumptions — Management Company');
  });
});

// ─── buildCompanyAssumptionsSection — mandatory header groups ─────────────────

describe('buildCompanyAssumptionsSection — mandatory header groups present', () => {
  const EXPECTED_HEADERS = [
    'Company Identity',
    'Macro & Inflation',
    'Management Fees',
    'Funding',
    'Partner Compensation',
    'Staffing',
    'Fixed Overhead (Year 1)',
    'Variable Costs',
    'Tax & Returns',
    'Acquisition (Standard Package)',
    'Debt (Default)',
    'Exit Defaults',
  ];

  it.each(EXPECTED_HEADERS)('header group "%s" is present', (label) => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const headerCategories = section.rows
      .filter((r) => r.isHeader)
      .map((r) => r.category);
    expect(headerCategories).toContain(label);
  });

  it('section contains exactly 12 header rows (one per group)', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const headers = section.rows.filter((r) => r.isHeader);
    expect(headers.length).toBe(12);
  });
});

// ─── buildCompanyAssumptionsSection — row structure ───────────────────────────

describe('buildCompanyAssumptionsSection — row structure', () => {
  it('every row has a category string', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    for (const r of section.rows) {
      expect(typeof r.category).toBe('string');
      expect(r.category.length).toBeGreaterThan(0);
    }
  });

  it('every row has a values array with at least one entry', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    for (const r of section.rows) {
      expect(Array.isArray(r.values)).toBe(true);
      expect(r.values.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('data rows (non-header) have indent=1', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const dataRows = section.rows.filter((r) => !r.isHeader);
    for (const r of dataRows) {
      expect(r.indent).toBe(1);
    }
  });

  it('header rows have isHeader=true', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    for (const r of section.rows) {
      if (r.isHeader) {
        expect(r.isHeader).toBe(true);
      }
    }
  });

  it('section has more rows than just the 12 headers', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    expect(section.rows.length).toBeGreaterThan(12);
  });
});

// ─── buildCompanyAssumptionsSection — mandatory fixed rows ────────────────────

describe('buildCompanyAssumptionsSection — Company Identity rows present', () => {
  it('Company Name row is present', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Company Name');
  });

  it('Projection Years row is present', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Projection Years');
  });

  it('Inflation Rate row is present', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Inflation Rate');
  });

  it('Cost of Equity row is present', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Cost of Equity');
  });

  it('Exit Cap Rate row is present', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Exit Cap Rate');
  });
});

// ─── buildCompanyAssumptionsSection — conditional rows ───────────────────────

describe('buildCompanyAssumptionsSection — conditional rows', () => {
  it('Company Inflation Rate row is included when companyInflationRate is present', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({ companyInflationRate: 0.035 }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Company Inflation Rate');
  });

  it('Company Inflation Rate row is absent when companyInflationRate is null', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({ companyInflationRate: null }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).not.toContain('Company Inflation Rate');
  });

  it('Company Inflation Rate row is absent when companyInflationRate is undefined', () => {
    const g = baseGlobals();
    delete g.companyInflationRate;
    const section = buildCompanyAssumptionsSection(g);
    const categories = section.rows.map((r) => r.category);
    expect(categories).not.toContain('Company Inflation Rate');
  });

  it('Exit Revenue Multiple row is included when exitRevenueMultiple is present', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({ exitRevenueMultiple: 3.5 }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Exit Revenue Multiple');
  });

  it('Exit Revenue Multiple row is absent when exitRevenueMultiple is null', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({ exitRevenueMultiple: null }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).not.toContain('Exit Revenue Multiple');
  });

  it('Refinance Interest Rate row is included when debtAssumptions.refiInterestRate is present', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({
        debtAssumptions: {
          acqLTV: 0.65,
          acqClosingCostRate: 0.015,
          interestRate: 0.055,
          amortizationYears: 25,
          refiLTV: 0.70,
          refiClosingCostRate: 0.01,
          refiInterestRate: 0.048,
        },
      }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Refinance Interest Rate');
  });

  it('Refinance Interest Rate row is absent when refiInterestRate is missing', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({
        debtAssumptions: {
          acqLTV: 0.65,
          acqClosingCostRate: 0.015,
          interestRate: 0.055,
          amortizationYears: 25,
          refiLTV: 0.70,
          refiClosingCostRate: 0.01,
          // no refiInterestRate
        },
      }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).not.toContain('Refinance Interest Rate');
  });

  it('Refinance Amortization row is included when refiAmortizationYears is present', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({
        debtAssumptions: {
          acqLTV: 0.65,
          acqClosingCostRate: 0.015,
          interestRate: 0.055,
          amortizationYears: 25,
          refiLTV: 0.70,
          refiClosingCostRate: 0.01,
          refiAmortizationYears: 20,
        },
      }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Refinance Amortization (Years)');
  });

  it('Refinance Period row is included when refiPeriodYears is present', () => {
    const section = buildCompanyAssumptionsSection(
      baseGlobals({
        debtAssumptions: {
          acqLTV: 0.65,
          acqClosingCostRate: 0.015,
          interestRate: 0.055,
          amortizationYears: 25,
          refiLTV: 0.70,
          refiClosingCostRate: 0.01,
          refiPeriodYears: 5,
        },
      }),
    );
    const categories = section.rows.map((r) => r.category);
    expect(categories).toContain('Refinance Period (Years)');
  });
});

// ─── buildCompanyAssumptionsSection — section ordering ───────────────────────

describe('buildCompanyAssumptionsSection — header group ordering', () => {
  it('Company Identity appears before Macro & Inflation', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const headers = section.rows.filter((r) => r.isHeader).map((r) => r.category);
    const identityIdx = headers.indexOf('Company Identity');
    const macroIdx = headers.indexOf('Macro & Inflation');
    expect(identityIdx).toBeLessThan(macroIdx);
  });

  it('Partner Compensation appears before Staffing', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const headers = section.rows.filter((r) => r.isHeader).map((r) => r.category);
    const partnerIdx = headers.indexOf('Partner Compensation');
    const staffingIdx = headers.indexOf('Staffing');
    expect(partnerIdx).toBeLessThan(staffingIdx);
  });

  it('Debt (Default) appears before Exit Defaults', () => {
    const section = buildCompanyAssumptionsSection(baseGlobals());
    const headers = section.rows.filter((r) => r.isHeader).map((r) => r.category);
    const debtIdx = headers.indexOf('Debt (Default)');
    const exitIdx = headers.indexOf('Exit Defaults');
    expect(debtIdx).toBeLessThan(exitIdx);
  });
});

// ─── buildCompanyAssumptionsSection — idempotency ────────────────────────────

describe('buildCompanyAssumptionsSection — idempotency', () => {
  it('calling twice with the same input produces identical sections', () => {
    const g = baseGlobals();
    const s1 = buildCompanyAssumptionsSection(g);
    const s2 = buildCompanyAssumptionsSection(g);
    expect(s1.title).toBe(s2.title);
    expect(s1.years).toEqual(s2.years);
    expect(s1.rows.length).toBe(s2.rows.length);
    expect(s1.rows.map((r) => r.category)).toEqual(s2.rows.map((r) => r.category));
  });
});
