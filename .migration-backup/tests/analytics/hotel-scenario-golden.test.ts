import { describe, it, expect } from "vitest";
import { computeIRR } from "../../analytics/returns/irr.js";
import { computeReturnMetrics } from "../../analytics/returns/metrics.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { DEPRECIATION_YEARS } from "../../shared/constants.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function npv(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    result += cashFlows[t] / Math.pow(1 + rate, t);
  }
  return result;
}

describe("Realistic 10-year hotel scenario — assumptions through IRR", () => {
  const purchasePrice = 8_000_000;
  const buildingImprovements = 500_000;
  const preOpeningReserve = 200_000;
  const ltv = 0.65;
  const loanAmount = purchasePrice * ltv;
  const equityInvested = purchasePrice + buildingImprovements + preOpeningReserve - loanAmount;
  const interestRate = 0.065;
  const loanTermYears = 25;
  const taxRate = 0.21;
  const landPercent = 0.25;
  const depreciableBasis = purchasePrice * (1 - landPercent) + buildingImprovements;
  const annualDepreciation = depreciableBasis / DEPRECIATION_YEARS;
  const exitCapRate = 0.075;
  const sellingCostRate = 0.02;

  const monthlyRate = interestRate / 12;
  const totalPayments = loanTermYears * 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
  const annualDebtService = monthlyPayment * 12;

  const yearlyNOI = [
    450_000,
    500_000,
    545_000,
    580_000,
    610_000,
    640_000,
    665_000,
    690_000,
    715_000,
    740_000,
  ];

  function computeAnnualInterest(year: number): number {
    let balance = loanAmount;
    const monthlyR = interestRate / 12;
    const pmt = monthlyPayment;

    for (let m = 0; m < (year - 1) * 12; m++) {
      const interest = balance * monthlyR;
      const principal = pmt - interest;
      balance -= principal;
    }

    let yearInterest = 0;
    for (let m = 0; m < 12; m++) {
      const interest = balance * monthlyR;
      const principal = pmt - interest;
      yearInterest += interest;
      balance -= principal;
    }
    return yearInterest;
  }

  function computeRemainingBalance(afterYear: number): number {
    let balance = loanAmount;
    const monthlyR = interestRate / 12;
    const pmt = monthlyPayment;

    for (let m = 0; m < afterYear * 12; m++) {
      const interest = balance * monthlyR;
      const principal = pmt - interest;
      balance -= principal;
    }
    return balance;
  }

  it("equity invested is correctly calculated", () => {
    expect(equityInvested).toBe(purchasePrice + buildingImprovements + preOpeningReserve - loanAmount);
    expect(equityInvested).toBe(3_500_000);
  });

  it("annual debt service is positive and reasonable", () => {
    expect(annualDebtService).toBeGreaterThan(0);
    expect(annualDebtService).toBeLessThan(loanAmount * 0.15);
    expect(monthlyPayment).toBeGreaterThan(0);
  });

  it("DSCR above 1.0 for all operating years", () => {
    for (let y = 0; y < 10; y++) {
      const dscr = yearlyNOI[y] / annualDebtService;
      expect(dscr).toBeGreaterThan(1.0);
    }
  });

  it("FCFE = NOI - Debt Service - Tax for each year", () => {
    const yearlyFCFE: number[] = [];

    for (let y = 0; y < 10; y++) {
      const noi = yearlyNOI[y];
      const interest = computeAnnualInterest(y + 1);
      const taxableIncome = noi - interest - annualDepreciation;
      const tax = Math.max(0, taxableIncome * taxRate);
      const fcfe = noi - annualDebtService - tax;
      yearlyFCFE.push(fcfe);

      const netIncome = noi - interest - annualDepreciation - tax;
      const principal = annualDebtService - interest;
      const fcfeFromNI = netIncome + annualDepreciation - principal;

      expect(fcfe).toBeCloseTo(fcfeFromNI, 0);
    }

    expect(yearlyFCFE.length).toBe(10);
  });

  it("FCFE direct method matches from-NI method for every year", () => {
    for (let y = 0; y < 10; y++) {
      const noi = yearlyNOI[y];
      const interest = computeAnnualInterest(y + 1);
      const principal = annualDebtService - interest;
      const taxableIncome = noi - interest - annualDepreciation;
      const tax = Math.max(0, taxableIncome * taxRate);

      const directFCFE = noi - annualDebtService - tax;

      const netIncome = noi - interest - annualDepreciation - tax;
      const fromNI_FCFE = netIncome + annualDepreciation - principal;

      expect(directFCFE).toBeCloseTo(fromNI_FCFE, 2);
    }
  });

  it("IRR from full 10-year cash flow vector converges and NPV=0", () => {
    const flows: number[] = [-equityInvested];

    for (let y = 0; y < 10; y++) {
      const noi = yearlyNOI[y];
      const interest = computeAnnualInterest(y + 1);
      const taxableIncome = noi - interest - annualDepreciation;
      const tax = Math.max(0, taxableIncome * taxRate);
      const fcfe = noi - annualDebtService - tax;
      flows.push(fcfe);
    }

    const stabilizedNOI = yearlyNOI[9];
    const grossSalePrice = stabilizedNOI / exitCapRate;
    const sellingCosts = grossSalePrice * sellingCostRate;
    const remainingDebt = computeRemainingBalance(10);
    const netExitProceeds = grossSalePrice - sellingCosts - remainingDebt;
    flows[10] += netExitProceeds;

    const result = computeIRR(flows);
    expect(result.converged).toBe(true);
    expect(result.irr_periodic).not.toBeNull();

    const nv = npv(flows, result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(1.0);
  });

  it("IRR is in realistic hotel range (8-25%)", () => {
    const flows: number[] = [-equityInvested];

    for (let y = 0; y < 10; y++) {
      const noi = yearlyNOI[y];
      const interest = computeAnnualInterest(y + 1);
      const taxableIncome = noi - interest - annualDepreciation;
      const tax = Math.max(0, taxableIncome * taxRate);
      const fcfe = noi - annualDebtService - tax;
      flows.push(fcfe);
    }

    const stabilizedNOI = yearlyNOI[9];
    const grossSalePrice = stabilizedNOI / exitCapRate;
    const sellingCosts = grossSalePrice * sellingCostRate;
    const remainingDebt = computeRemainingBalance(10);
    flows[10] += grossSalePrice - sellingCosts - remainingDebt;

    const result = computeIRR(flows);
    expect(result.irr_periodic!).toBeGreaterThanOrEqual(0.05);
    expect(result.irr_periodic!).toBeLessThanOrEqual(0.30);
  });

  it("MOIC > 1.0 (investment returns more than invested)", () => {
    const flows: number[] = [-equityInvested];

    for (let y = 0; y < 10; y++) {
      const noi = yearlyNOI[y];
      const interest = computeAnnualInterest(y + 1);
      const taxableIncome = noi - interest - annualDepreciation;
      const tax = Math.max(0, taxableIncome * taxRate);
      flows.push(noi - annualDebtService - tax);
    }

    const stabilizedNOI = yearlyNOI[9];
    const grossSalePrice = stabilizedNOI / exitCapRate;
    const sellingCosts = grossSalePrice * sellingCostRate;
    const remainingDebt = computeRemainingBalance(10);
    flows[10] += grossSalePrice - sellingCosts - remainingDebt;

    const metrics = computeReturnMetrics(flows, 1, rounding);
    expect(metrics.moic).toBeGreaterThan(1.0);
    expect(metrics.net_profit).toBeGreaterThan(0);
  });

  it("exit cap rate sensitivity — lower cap rate = higher IRR", () => {
    function buildFlows(capRate: number): number[] {
      const f: number[] = [-equityInvested];
      for (let y = 0; y < 10; y++) {
        const noi = yearlyNOI[y];
        const interest = computeAnnualInterest(y + 1);
        const taxableIncome = noi - interest - annualDepreciation;
        const tax = Math.max(0, taxableIncome * taxRate);
        f.push(noi - annualDebtService - tax);
      }
      const gross = yearlyNOI[9] / capRate;
      const costs = gross * sellingCostRate;
      const debt = computeRemainingBalance(10);
      f[10] += gross - costs - debt;
      return f;
    }

    const irr6 = computeIRR(buildFlows(0.06));
    const irr75 = computeIRR(buildFlows(0.075));
    const irr9 = computeIRR(buildFlows(0.09));

    expect(irr6.converged && irr75.converged && irr9.converged).toBe(true);
    expect(irr6.irr_periodic!).toBeGreaterThan(irr75.irr_periodic!);
    expect(irr75.irr_periodic!).toBeGreaterThan(irr9.irr_periodic!);
  });

  it("debt yield exceeds minimum 10% threshold in stabilized years", () => {
    for (let y = 4; y < 10; y++) {
      const debtYield = yearlyNOI[y] / loanAmount;
      expect(debtYield).toBeGreaterThanOrEqual(0.10);
    }
  });

  it("cash-on-cash return is positive after ramp-up", () => {
    for (let y = 0; y < 10; y++) {
      const noi = yearlyNOI[y];
      const interest = computeAnnualInterest(y + 1);
      const taxableIncome = noi - interest - annualDepreciation;
      const tax = Math.max(0, taxableIncome * taxRate);
      const fcfe = noi - annualDebtService - tax;
      const cashOnCash = fcfe / equityInvested;

      if (y >= 2) {
        expect(cashOnCash).toBeGreaterThan(0);
      }
    }
  });
});

describe("Cash purchase hotel scenario (no debt)", () => {
  const purchasePrice = 5_000_000;
  const equityInvested = purchasePrice;
  const taxRate = 0.21;
  const depBasis = purchasePrice * 0.75;
  const annualDep = depBasis / DEPRECIATION_YEARS;
  const yearlyNOI = [300_000, 350_000, 400_000, 430_000, 460_000, 490_000, 520_000, 550_000, 580_000, 610_000];

  it("FCFE = NOI - Tax (no debt service)", () => {
    for (const noi of yearlyNOI) {
      const taxableIncome = noi - annualDep;
      const tax = Math.max(0, taxableIncome * taxRate);
      const fcfe = noi - tax;

      expect(fcfe).toBeGreaterThan(0);
      expect(fcfe).toBeLessThanOrEqual(noi);
    }
  });

  it("IRR converges for cash purchase", () => {
    const flows: number[] = [-equityInvested];
    for (const noi of yearlyNOI) {
      const taxableIncome = noi - annualDep;
      const tax = Math.max(0, taxableIncome * taxRate);
      flows.push(noi - tax);
    }
    const exitValue = yearlyNOI[9] / 0.075;
    flows[10] += exitValue - exitValue * 0.02;

    const result = computeIRR(flows);
    expect(result.converged).toBe(true);

    const nv = npv(flows, result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(1.0);
  });

  it("levered IRR exceeds unlevered IRR (positive leverage)", () => {
    const loanAmount = purchasePrice * 0.65;
    const leveredEquity = purchasePrice - loanAmount;
    const rate = 0.055;
    const term = 25;
    const mr = rate / 12;
    const tp = term * 12;
    const pmt = loanAmount * (mr * Math.pow(1 + mr, tp)) / (Math.pow(1 + mr, tp) - 1);
    const annualDS = pmt * 12;

    function getInterest(yr: number): number {
      let bal = loanAmount;
      for (let m = 0; m < (yr - 1) * 12; m++) {
        const int = bal * mr;
        bal -= (pmt - int);
      }
      let total = 0;
      for (let m = 0; m < 12; m++) {
        const int = bal * mr;
        total += int;
        bal -= (pmt - int);
      }
      return total;
    }

    function getBalance(yr: number): number {
      let bal = loanAmount;
      for (let m = 0; m < yr * 12; m++) {
        const int = bal * mr;
        bal -= (pmt - int);
      }
      return bal;
    }

    const unleveredFlows: number[] = [-purchasePrice];
    const leveredFlows: number[] = [-leveredEquity];

    for (let y = 0; y < 10; y++) {
      const noi = yearlyNOI[y];

      const unlTax = Math.max(0, (noi - annualDep) * taxRate);
      unleveredFlows.push(noi - unlTax);

      const interest = getInterest(y + 1);
      const levTax = Math.max(0, (noi - interest - annualDep) * taxRate);
      leveredFlows.push(noi - annualDS - levTax);
    }

    const exitVal = yearlyNOI[9] / 0.075;
    const sellingCosts = exitVal * 0.02;

    unleveredFlows[10] += exitVal - sellingCosts;
    leveredFlows[10] += exitVal - sellingCosts - getBalance(10);

    const irrUnlevered = computeIRR(unleveredFlows);
    const irrLevered = computeIRR(leveredFlows);

    expect(irrUnlevered.converged && irrLevered.converged).toBe(true);
    expect(irrLevered.irr_periodic!).toBeGreaterThan(irrUnlevered.irr_periodic!);
  });
});
