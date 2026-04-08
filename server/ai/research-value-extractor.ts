type ResearchEntry = { display: string; mid: number; source: "ai" };

const parsePct = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
};

const parseRange = (s: string | undefined): { low: number; high: number; mid: number } | null => {
  if (!s) return null;
  const nums = s.replace(/[^0-9.,\-–]/g, ' ').split(/[\s–\-]+/).map(x => parseFloat(x.replace(/,/g, ''))).filter(n => !isNaN(n));
  if (nums.length >= 2) return { low: nums[0], high: nums[1], mid: Math.round((nums[0] + nums[1]) / 2) };
  if (nums.length === 1) return { low: nums[0], high: nums[0], mid: nums[0] };
  return null;
};

const parseCostRate = (cat: { recommendedRate?: string } | undefined): { display: string; mid: number } | null => {
  if (!cat?.recommendedRate) return null;
  const pct = parsePct(cat.recommendedRate);
  return pct != null ? { display: cat.recommendedRate, mid: pct } : null;
};

const entry = (v: { display: string; mid: number } | null): ResearchEntry | null =>
  v ? { ...v, source: "ai" as const } : null;

/**
 * Extract key research values from parsed property research JSON into
 * the ResearchValueEntry format used by the property's researchValues column.
 * Returns null if the content is unparsed (rawResponse) or not property research.
 */
export function extractResearchValues(content: Record<string, any>): Record<string, ResearchEntry> | null {
  if (content.rawResponse) return null;

  const c = content;
  const vals: Record<string, ResearchEntry | null> = {};

  // ADR
  const adrRange = parseRange(c.adrAnalysis?.recommendedRange);
  if (adrRange) vals.adr = entry({ display: c.adrAnalysis.recommendedRange, mid: adrRange.mid });

  // Occupancy
  const occText = c.occupancyAnalysis?.rampUpTimeline;
  if (occText) {
    const stabMatch = occText.match(/stabilized occupancy of (\d+)[–\-](\d+)%/);
    if (stabMatch) vals.occupancy = entry({ display: `${stabMatch[1]}%–${stabMatch[2]}%`, mid: Math.round((parseInt(stabMatch[1]) + parseInt(stabMatch[2])) / 2) });
    const initMatch = occText.match(/initial occupancy (?:around |of )?(\d+)[–\-](\d+)%/);
    if (initMatch) vals.startOccupancy = entry({ display: `${initMatch[1]}%–${initMatch[2]}%`, mid: Math.round((parseInt(initMatch[1]) + parseInt(initMatch[2])) / 2) });
    const rampMatch = occText.match(/(\d+)[–\-](\d+) months/);
    if (rampMatch) vals.rampMonths = entry({ display: `${rampMatch[1]}–${rampMatch[2]} mo`, mid: Math.round((parseInt(rampMatch[1]) + parseInt(rampMatch[2])) / 2) });
  }

  // Cap rate
  const capRange = parseRange(c.capRateAnalysis?.recommendedRange);
  if (capRange) vals.capRate = entry({ display: c.capRateAnalysis.recommendedRange, mid: (capRange.low + capRange.high) / 2 });

  // Catering
  const cateringPct = parsePct(c.cateringAnalysis?.recommendedBoostPercent);
  if (cateringPct != null) vals.catering = entry({ display: c.cateringAnalysis.recommendedBoostPercent, mid: cateringPct });

  // Land value
  const landPct = parsePct(c.landValueAllocation?.recommendedPercent);
  if (landPct != null) vals.landValue = entry({ display: c.landValueAllocation.recommendedPercent, mid: landPct });

  // Operating costs
  const oc = c.operatingCostAnalysis;
  if (oc) {
    const m = (k: string, cat: any) => { const v = parseCostRate(cat); if (v) vals[k] = entry(v); };
    m("costHousekeeping", oc.roomRevenueBased?.housekeeping);
    m("costFB", oc.roomRevenueBased?.fbCostOfSales);
    m("costAdmin", oc.totalRevenueBased?.adminGeneral);
    m("costPropertyOps", oc.totalRevenueBased?.propertyOps);
    m("costUtilities", oc.totalRevenueBased?.utilities);
    m("costFFE", oc.totalRevenueBased?.ffeReserve);
    m("costMarketing", oc.totalRevenueBased?.marketing);
    m("costIT", oc.totalRevenueBased?.it);
    m("costOther", oc.totalRevenueBased?.other);
  }

  // Property value costs
  const pvc = c.propertyValueCostAnalysis;
  if (pvc) {
    const v2 = parseCostRate(pvc.propertyTaxes); if (v2) vals.costPropertyTaxes = entry(v2);
  }

  // Management service fees
  const msf = c.managementServiceFeeAnalysis;
  if (msf) {
    const sf = msf.serviceFeeCategories;
    if (sf) {
      const m = (k: string, cat: any) => { const v = parseCostRate(cat); if (v) vals[k] = entry(v); };
      m("svcFeeMarketing", sf.marketing);
      m("svcFeeTechRes", sf.technologyReservations);
      m("svcFeeAccounting", sf.accounting);
      m("svcFeeRevMgmt", sf.revenueManagement);
      m("svcFeeGeneralMgmt", sf.generalManagement);
      m("svcFeeProcurement", sf.procurement);
    }
    const incV = parseCostRate(msf.incentiveFee); if (incV) vals.incentiveFee = entry(incV);
  }

  // Income tax
  const ita = c.incomeTaxAnalysis;
  if (ita?.recommendedRate) {
    const v = parseCostRate({ recommendedRate: ita.recommendedRate });
    if (v) vals.incomeTax = entry(v);
  }

  // Local Economics
  const lea = c.localEconomics;
  if (lea) {
    if (lea.inflationRate) {
      const pct = parsePct(lea.inflationRate);
      if (pct != null) vals.inflationRate = entry({ display: lea.inflationRate, mid: pct });
    }
    if (lea.interestRate) {
      const pct = parsePct(lea.interestRate);
      if (pct != null) vals.interestRate = entry({ display: lea.interestRate, mid: pct });
    }
  }

  // Marketing Costs
  const mca = c.marketingCosts;
  if (mca?.marketingCostRate) {
    const pct = parsePct(mca.marketingCostRate);
    if (pct != null) vals.costMarketing = entry({ display: mca.marketingCostRate, mid: pct });
  }

  // ADR growth
  const adrGrowth = c.adrAnalysis?.recommendedGrowthRate ?? c.adrAnalysis?.annualGrowthRate;
  if (adrGrowth) { const pct = parsePct(adrGrowth); if (pct != null) vals.adrGrowth = entry({ display: adrGrowth, mid: pct }); }

  // Occupancy step
  const occStep = c.occupancyAnalysis?.recommendedGrowthStep ?? c.occupancyAnalysis?.growthStepPercent;
  if (occStep) { const pct = parsePct(occStep); if (pct != null) vals.occupancyStep = entry({ display: occStep, mid: pct }); }

  // Revenue shares
  const evRev = c.eventDemandAnalysis?.recommendedRevenueShare ?? c.eventDemandAnalysis?.recommendedPercent;
  if (evRev) { const pct = parsePct(evRev); if (pct != null) vals.revShareEvents = entry({ display: evRev, mid: pct }); }
  const fbRev = c.fbRevenueAnalysis?.recommendedPercent ?? c.cateringAnalysis?.fbRevenueShare;
  if (fbRev) { const pct = parsePct(fbRev); if (pct != null) vals.revShareFB = entry({ display: fbRev, mid: pct }); }
  const otherRev = c.ancillaryRevenueAnalysis?.recommendedPercent;
  if (otherRev) { const pct = parsePct(otherRev); if (pct != null) vals.revShareOther = entry({ display: otherRev, mid: pct }); }

  // Sale commission
  const comm = c.dispositionAnalysis?.recommendedCommission ?? c.capRateAnalysis?.saleCommission;
  if (comm) { const pct = parsePct(comm); if (pct != null) vals.saleCommission = entry({ display: comm, mid: pct }); }

  // Cost segregation splits
  const csa = c.costSegregationAnalysis ?? c.capitalStructureAnalysis;
  if (csa) {
    const cs5 = parsePct(csa.fiveYearPercent ?? csa.costSeg5yrPct);
    if (cs5 != null) vals.costSeg5yrPct = entry({ display: csa.fiveYearPercent ?? csa.costSeg5yrPct, mid: cs5 });
    const cs7 = parsePct(csa.sevenYearPercent ?? csa.costSeg7yrPct);
    if (cs7 != null) vals.costSeg7yrPct = entry({ display: csa.sevenYearPercent ?? csa.costSeg7yrPct, mid: cs7 });
    const cs15 = parsePct(csa.fifteenYearPercent ?? csa.costSeg15yrPct);
    if (cs15 != null) vals.costSeg15yrPct = entry({ display: csa.fifteenYearPercent ?? csa.costSeg15yrPct, mid: cs15 });
  }

  // Working capital
  const wca = c.workingCapitalAnalysis ?? c.capitalStructureAnalysis;
  if (wca) {
    const arVal = wca.arDays ?? wca.accountsReceivableDays;
    if (arVal != null) {
      const arNum = typeof arVal === "number" ? arVal : parseInt(String(arVal), 10);
      if (!isNaN(arNum)) vals.arDays = entry({ display: `${arNum} days`, mid: arNum });
    }
    const apVal = wca.apDays ?? wca.accountsPayableDays;
    if (apVal != null) {
      const apNum = typeof apVal === "number" ? apVal : parseInt(String(apVal), 10);
      if (!isNaN(apNum)) vals.apDays = entry({ display: `${apNum} days`, mid: apNum });
    }
  }

  // LTV
  const ltvSrc = c.capitalStructureAnalysis?.recommendedLTV ?? c.financingAnalysis?.recommendedLTV;
  if (ltvSrc) { const pctV = parsePct(ltvSrc); if (pctV != null) vals.ltv = entry({ display: ltvSrc, mid: pctV }); }

  // Pre-opening costs
  const preSrc = c.preOpeningAnalysis?.estimatedCost ?? c.preOpeningAnalysis?.recommendedBudget;
  if (preSrc) {
    const preRange = parseRange(preSrc);
    if (preRange) vals.preOpeningCosts = entry({ display: preSrc, mid: preRange.mid });
  }

  // Platform fee (VRBO/STR)
  const platSrc = c.platformFeeAnalysis?.recommendedRate ?? c.platformEconomics?.totalPlatformFeeRate;
  if (platSrc) { const pctV = parsePct(platSrc); if (pctV != null) vals.platformFee = entry({ display: platSrc, mid: pctV }); }

  // Filter out nulls
  const result: Record<string, ResearchEntry> = {};
  for (const [k, v] of Object.entries(vals)) {
    if (v) result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : null;
}
