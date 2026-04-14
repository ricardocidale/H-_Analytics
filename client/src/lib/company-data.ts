import { CompanyMonthlyFinancials } from "./financialEngine";

export function generateCompanyIncomeData(
  financials: CompanyMonthlyFinancials[],
  years: number[],
  properties: any[],
  propertyFinancials: any[],
  summaryOnly?: boolean
) {
  const rows: { category: string; values: number[]; isHeader?: boolean; indent?: number }[] = [];
  
  rows.push({ category: "Revenue", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.totalRevenue, 0);
  }), isHeader: true });
  
  rows.push({ category: "Service Fees", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.baseFeeRevenue, 0);
  }), indent: 1 });
  
  if (!summaryOnly) {
    const categoryNameSet = new Set<string>();
    for (const month of financials) {
      const cats = month?.serviceFeeBreakdown?.byCategory;
      if (cats) for (const key of Object.keys(cats)) categoryNameSet.add(key);
    }
    const categoryNames = Array.from(categoryNameSet).sort();
    if (categoryNames.length > 0) {
      categoryNames.forEach(catName => {
        rows.push({ category: catName, values: years.map((_, y) => {
          const yearData = financials.slice(y * 12, (y + 1) * 12);
          return yearData.reduce((a, m) => (m.serviceFeeBreakdown?.byCategory?.[catName] ?? 0) + a, 0);
        }), indent: 2 });
      });
    } else {
      properties.forEach((prop, idx) => {
        const getPropertyYearlyBaseFee = (propIdx: number, year: number) => {
          const pf = propertyFinancials[propIdx].financials;
          const yd = pf.slice(year * 12, (year + 1) * 12);
          return yd.reduce((a: number, m: any) => a + m.feeBase, 0);
        };
        rows.push({ category: prop.name, values: years.map((_, y) => getPropertyYearlyBaseFee(idx, y)), indent: 2 });
      });
    }
  }
  
  rows.push({ category: "Incentive Fees", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.incentiveFeeRevenue, 0);
  }), indent: 1 });

  if (!summaryOnly) {
    properties.forEach((prop) => {
      rows.push({ category: prop.name, values: years.map((_, y) => {
        const yearData = financials.slice(y * 12, (y + 1) * 12);
        return yearData.reduce((a, m) => (m.incentiveFeeByPropertyId?.[String(prop.id)] ?? 0) + a, 0);
      }), indent: 2 });
    });
  }

  const hasVendorCosts = financials.some(m => m.totalVendorCost > 0);
  if (hasVendorCosts) {
    rows.push({ category: "Cost of Centralized Services", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.totalVendorCost, 0);
    }), isHeader: true });

    if (!summaryOnly) {
      const sampleCosts = financials.find(m => m.costOfCentralizedServices)?.costOfCentralizedServices;
      if (sampleCosts) {
        Object.keys(sampleCosts.byCategory).forEach(catName => {
          const cat = sampleCosts.byCategory[catName];
          if (cat.serviceModel === 'centralized') {
            rows.push({ category: `${catName} (Vendor Cost)`, values: years.map((_, y) => {
              const yearData = financials.slice(y * 12, (y + 1) * 12);
              return yearData.reduce((a, m) => a + (m.costOfCentralizedServices?.byCategory[catName]?.vendorCost ?? 0), 0);
            }), indent: 1 });
          }
        });
      }
    }

    rows.push({ category: "Gross Profit", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.grossProfit, 0);
    }), isHeader: true });
  }

  rows.push({ category: "Operating Expenses", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.totalExpenses, 0);
  }), isHeader: true });
  
  if (!summaryOnly) {
    rows.push({ category: "Partner Compensation", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.partnerCompensation, 0);
    }), indent: 1 });
    
    rows.push({ category: "Staff Salaries", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.staffCompensation, 0);
    }), indent: 1 });
    
    rows.push({ category: "Office Lease", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.officeLease, 0);
    }), indent: 1 });
    
    rows.push({ category: "Professional Services", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.professionalServices, 0);
    }), indent: 1 });
    
    rows.push({ category: "Tech Infrastructure", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.techInfrastructure, 0);
    }), indent: 1 });
    
    rows.push({ category: "Business Insurance", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.businessInsurance, 0);
    }), indent: 1 });
    
    rows.push({ category: "Travel", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.travelCosts, 0);
    }), indent: 1 });
    
    rows.push({ category: "IT Licensing", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.itLicensing, 0);
    }), indent: 1 });
    
    rows.push({ category: "Marketing", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.marketing, 0);
    }), indent: 1 });
    
    rows.push({ category: "Misc Operations", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.miscOps, 0);
    }), indent: 1 });
  }

  const hasInterest = financials.some(m => m.fundingInterestExpense > 0);
  if (hasInterest) {
    rows.push({ category: "Operating Income (EBITDA)", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + (m.preTaxIncome + m.fundingInterestExpense), 0);
    }), isHeader: true });

    rows.push({ category: "Interest Expense", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.fundingInterestExpense, 0);
    }), indent: 1 });

    rows.push({ category: "Pre-Tax Income", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.preTaxIncome, 0);
    }), indent: 0 });

    rows.push({ category: "Tax", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.companyIncomeTax, 0);
    }), indent: 1 });
  }
  
  rows.push({ category: "Net Income", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.netIncome, 0);
  }), isHeader: true });
  
  rows.push({ category: "Net Margin (%)", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    const netIncome = yearData.reduce((a, m) => a + m.netIncome, 0);
    const totalRevenue = yearData.reduce((a, m) => a + m.totalRevenue, 0);
    return totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;
  }), indent: 1 });
  
  return { years, rows };
}

export function generateCompanyCashFlowData(
  financials: CompanyMonthlyFinancials[],
  years: number[],
  properties: any[],
  propertyFinancials: any[],
  fundingLabel: string,
  summaryOnly?: boolean
) {
  const rows: { category: string; values: number[]; isHeader?: boolean; isSubtotal?: boolean; indent?: number }[] = [];

  rows.push({ category: "Cash Flow from Operating Activities", values: years.map(() => 0), isHeader: true });

  rows.push({ category: "Cash Received from Management Fees", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.totalRevenue, 0);
  }), indent: 1 });

  rows.push({ category: "Service Fees", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.baseFeeRevenue, 0);
  }), indent: 2 });

  if (!summaryOnly) {
    const cfCategoryNameSet = new Set<string>();
    for (const month of financials) {
      const cats = month?.serviceFeeBreakdown?.byCategory;
      if (cats) for (const key of Object.keys(cats)) cfCategoryNameSet.add(key);
    }
    const cfCategoryNames = Array.from(cfCategoryNameSet).sort();
    if (cfCategoryNames.length > 0) {
      cfCategoryNames.forEach(catName => {
        rows.push({ category: catName, values: years.map((_, y) => {
          const yearData = financials.slice(y * 12, (y + 1) * 12);
          return yearData.reduce((a, m) => (m.serviceFeeBreakdown?.byCategory?.[catName] ?? 0) + a, 0);
        }), indent: 3 });
      });
    } else {
      properties.forEach((prop, idx) => {
        const getPropertyYearlyBaseFee = (propIdx: number, year: number) => {
          const pf = propertyFinancials[propIdx].financials;
          const yd = pf.slice(year * 12, (year + 1) * 12);
          return yd.reduce((a: number, m: any) => a + m.feeBase, 0);
        };
        rows.push({ category: prop.name, values: years.map((_, y) => getPropertyYearlyBaseFee(idx, y)), indent: 3 });
      });
    }
  }

  rows.push({ category: "Incentive Fees", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.incentiveFeeRevenue, 0);
  }), indent: 2 });

  if (!summaryOnly) {
    properties.forEach((prop) => {
      rows.push({ category: prop.name, values: years.map((_, y) => {
        const yearData = financials.slice(y * 12, (y + 1) * 12);
        return yearData.reduce((a, m) => (m.incentiveFeeByPropertyId?.[String(prop.id)] ?? 0) + a, 0);
      }), indent: 3 });
    });
  }

  rows.push({ category: "Cash Paid for Operating Expenses", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return -yearData.reduce((a, m) => a + m.totalExpenses, 0);
  }), indent: 1 });

  if (!summaryOnly) {
    rows.push({ category: "Compensation", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.partnerCompensation + m.staffCompensation, 0);
    }), indent: 2 });

    rows.push({ category: "Partner Compensation", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.partnerCompensation, 0);
    }), indent: 3 });

    rows.push({ category: "Staff Compensation", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.staffCompensation, 0);
    }), indent: 3 });

    rows.push({ category: "Fixed Overhead", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.officeLease + m.professionalServices + m.techInfrastructure + m.businessInsurance, 0);
    }), indent: 2 });

    rows.push({ category: "Office Lease", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.officeLease, 0);
    }), indent: 3 });

    rows.push({ category: "Professional Services", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.professionalServices, 0);
    }), indent: 3 });

    rows.push({ category: "Tech Infrastructure", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.techInfrastructure, 0);
    }), indent: 3 });

    rows.push({ category: "Business Insurance", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.businessInsurance, 0);
    }), indent: 3 });

    rows.push({ category: "Variable Costs", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.travelCosts + m.itLicensing + m.marketing + m.miscOps, 0);
    }), indent: 2 });

    rows.push({ category: "Travel", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.travelCosts, 0);
    }), indent: 3 });

    rows.push({ category: "IT Licensing", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.itLicensing, 0);
    }), indent: 3 });

    rows.push({ category: "Marketing", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.marketing, 0);
    }), indent: 3 });

    rows.push({ category: "Misc Operations", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.miscOps, 0);
    }), indent: 3 });
  }

  const cfHasInterest = financials.some(m => m.fundingInterestExpense > 0);
  if (cfHasInterest) {
    rows.push({ category: "Add Back: Interest Expense", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.fundingInterestExpense, 0);
    }), indent: 1 });
  }

  rows.push({ category: "Net Cash from Operating Activities", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.netIncome + m.fundingInterestExpense, 0);
  }), isSubtotal: true });

  rows.push({ category: "Cash Flow from Financing Activities", values: years.map(() => 0), isHeader: true });

  rows.push({ category: `${fundingLabel} Funding Received`, values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.safeFunding, 0);
  }), indent: 1 });

  if (!summaryOnly) {
    rows.push({ category: `${fundingLabel} Tranche 1`, values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.safeFunding1, 0);
    }), indent: 2 });

    rows.push({ category: `${fundingLabel} Tranche 2`, values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return yearData.reduce((a, m) => a + m.safeFunding2, 0);
    }), indent: 2 });
  }

  if (financials.some(m => m.fundingInterestPayment > 0)) {
    rows.push({ category: "Interest Paid on Notes", values: years.map((_, y) => {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      return -yearData.reduce((a, m) => a + m.fundingInterestPayment, 0);
    }), indent: 1 });
  }

  rows.push({ category: "Net Cash from Financing Activities", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.safeFunding - m.fundingInterestPayment, 0);
  }), isSubtotal: true });

  rows.push({ category: "Net Increase (Decrease) in Cash", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.cashFlow, 0);
  }), isHeader: true });

  let cumCash = 0;
  const openingCash = years.map((_, y) => {
    if (y === 0) return 0;
    const prevYearData = financials.slice(0, y * 12);
    return prevYearData.reduce((a, m) => a + m.cashFlow, 0);
  });
  rows.push({ category: "Opening Cash Balance", values: openingCash, indent: 0 });

  rows.push({ category: "Closing Cash Balance", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    cumCash += yearData.reduce((a, m) => a + m.cashFlow, 0);
    return cumCash;
  }), isHeader: true });

  const netCashOps = years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.netIncome + m.fundingInterestExpense, 0);
  });
  rows.push({ category: "", values: years.map(() => 0) });
  rows.push({ category: "Free Cash Flow", values: years.map(() => 0), isHeader: true });
  rows.push({ category: "Net Cash from Operating Activities", values: netCashOps, indent: 1 });
  rows.push({ category: "Free Cash Flow (FCF)", values: netCashOps, isSubtotal: true, indent: 1 });
  rows.push({ category: "Less: Funding Interest Payments", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return -yearData.reduce((a, m) => a + m.fundingInterestPayment, 0);
  }), indent: 1 });
  rows.push({ category: "Free Cash Flow to Equity (FCFE)", values: years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    return yearData.reduce((a, m) => a + m.netIncome + m.fundingInterestExpense - m.fundingInterestPayment, 0);
  }), isSubtotal: true, indent: 1 });

  return { years, rows };
}

export function generateCompanyBalanceData(
  financials: CompanyMonthlyFinancials[],
  years: number[],
  fundingLabel: string,
  _summaryOnly?: boolean
) {
  const rows: { category: string; values: number[]; isHeader?: boolean; indent?: number }[] = [];
  
  let cumCash = 0;
  const cashValues = years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    cumCash += yearData.reduce((a, m) => a + m.cashFlow, 0);
    return cumCash;
  });
  
  let cumRetained = 0;
  const retainedValues = years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    cumRetained += yearData.reduce((a, m) => a + m.netIncome, 0);
    return cumRetained;
  });
  
  let cumSafe = 0;
  const safeValues = years.map((_, y) => {
    const yearData = financials.slice(y * 12, (y + 1) * 12);
    cumSafe += yearData.reduce((a, m) => a + m.safeFunding, 0);
    return cumSafe;
  });

  const accruedInterestValues = years.map((_, y) => {
    const yearEnd = financials.slice(y * 12, (y + 1) * 12);
    return yearEnd.length > 0 ? (yearEnd[yearEnd.length - 1].cumulativeAccruedInterest ?? 0) : 0;
  });
  const hasAccruedInterest = accruedInterestValues.some(v => v > 0);
  const totalLiabilitiesValues = years.map((_, i) => safeValues[i] + accruedInterestValues[i]);
  
  rows.push({ category: "ASSETS", values: years.map(() => 0), isHeader: true });
  rows.push({ category: "Cash & Cash Equivalents", values: cashValues, indent: 1 });
  rows.push({ category: "TOTAL ASSETS", values: cashValues, isHeader: true });
  
  rows.push({ category: "LIABILITIES", values: years.map(() => 0), isHeader: true });
  rows.push({ category: `${fundingLabel} Notes Payable`, values: safeValues, indent: 1 });
  if (hasAccruedInterest) {
    rows.push({ category: "Accrued Interest on Notes", values: accruedInterestValues, indent: 1 });
  }
  rows.push({ category: "TOTAL LIABILITIES", values: totalLiabilitiesValues, isHeader: true });
  
  rows.push({ category: "EQUITY", values: years.map(() => 0), isHeader: true });
  rows.push({ category: "Retained Earnings", values: retainedValues, indent: 1 });
  rows.push({ category: "TOTAL EQUITY", values: retainedValues, isHeader: true });

  rows.push({ category: "TOTAL LIABILITIES & EQUITY", values: years.map((_, i) => totalLiabilitiesValues[i] + retainedValues[i]), isHeader: true });
  
  return { years, rows };
}
