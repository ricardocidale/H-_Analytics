import { PAGE_DIMS, type BrandPalette, buildBrandPalette } from "./exportStyles";
import {
  type ResearchExportOptions,
  fetchBranding,
  loadLogoImage,
  sectionColors,
  brandedHeader,
  addSectionHeader,
  addParagraph,
  addKeyValue,
  addBulletList,
  addTable,
} from "./researchPdfHelpers";

export function renderPropertyResearch(doc: any, autoTable: any, content: any, y: number, pageW: number, brand: BrandPalette): number {
  const colors = sectionColors(brand);
  const c = (i: number) => colors[i % colors.length];

  if (content.marketOverview) {
    y = addSectionHeader(doc, "Market Overview", y, c(0));
    y = addParagraph(doc, content.marketOverview.summary, y, pageW, brand);
    if (content.marketOverview.keyMetrics?.length) {
      y = addTable(doc, autoTable, ["Metric", "Value", "Source"],
        content.marketOverview.keyMetrics.map((m: any) => [m.label, m.value, m.source || ""]),
        y, c(0), brand);
    }
  }

  if (content.stabilizationTimeline) {
    y = addSectionHeader(doc, "Stabilization Timeline", y, c(1));
    y = addParagraph(doc, content.stabilizationTimeline.summary, y, pageW, brand);
    if (content.stabilizationTimeline.phases?.length) {
      y = addTable(doc, autoTable, ["Phase", "Duration", "Description", "Occupancy Target"],
        content.stabilizationTimeline.phases.map((p: any) => [p.phase, p.duration, p.description, p.occupancyTarget || ""]),
        y, c(1), brand);
    }
    if (content.stabilizationTimeline.totalMonths) {
      y = addKeyValue(doc, "Total Months to Stabilization", content.stabilizationTimeline.totalMonths, y, brand);
    }
  }

  if (content.adrAnalysis) {
    y = addSectionHeader(doc, "ADR Analysis", y, c(2));
    y = addKeyValue(doc, "Market Average ADR", content.adrAnalysis.marketAverage || "N/A", y, brand);
    y = addKeyValue(doc, "Boutique Range", content.adrAnalysis.boutiqueRange || "N/A", y, brand);
    y = addKeyValue(doc, "Recommended Range", content.adrAnalysis.recommendedRange || "N/A", y, brand);
    y = addParagraph(doc, content.adrAnalysis.rationale, y, pageW, brand);
    if (content.adrAnalysis.comparables?.length) {
      y = addTable(doc, autoTable, ["Property", "ADR", "Type"],
        content.adrAnalysis.comparables.map((c: any) => [c.name, c.adr, c.type || ""]),
        y, c(2), brand);
    }
  }

  if (content.occupancyAnalysis) {
    y = addSectionHeader(doc, "Occupancy Analysis", y, c(3));
    y = addKeyValue(doc, "Market Average", content.occupancyAnalysis.marketAverage || "N/A", y, brand);
    y = addKeyValue(doc, "Ramp-Up Timeline", content.occupancyAnalysis.rampUpTimeline || "N/A", y, brand);
    if (content.occupancyAnalysis.seasonalPattern?.length) {
      y = addTable(doc, autoTable, ["Season", "Occupancy", "Notes"],
        content.occupancyAnalysis.seasonalPattern.map((s: any) => [s.season, s.occupancy, s.notes || ""]),
        y, c(3), brand);
    }
  }

  if (content.eventDemand) {
    y = addSectionHeader(doc, "Event & Experience Demand", y, c(4));
    const eventTypes = [
      { key: "corporateEvents", label: "Corporate Events" },
      { key: "exoticEvents", label: "Exotic & Unique Events" },
      { key: "wellnessRetreats", label: "Wellness Retreats" },
      { key: "weddingsPrivate", label: "Weddings & Private" },
    ];
    for (const et of eventTypes) {
      if (content.eventDemand[et.key]) {
        y = addKeyValue(doc, et.label, "", y, brand);
        y = addParagraph(doc, content.eventDemand[et.key], y, pageW, brand);
      }
    }
    if (content.eventDemand.estimatedEventRevShare) {
      y = addKeyValue(doc, "Est. Event Revenue Share", content.eventDemand.estimatedEventRevShare, y, brand);
    }
    if (content.eventDemand.keyDrivers?.length) {
      y = addBulletList(doc, content.eventDemand.keyDrivers, y, pageW, brand);
    }
  }

  if (content.cateringAnalysis) {
    y = addSectionHeader(doc, "Catering & F&B Boost Analysis", y, c(5));
    y = addKeyValue(doc, "Recommended Boost", content.cateringAnalysis.recommendedBoostPercent || "N/A", y, brand);
    y = addKeyValue(doc, "Market Range", content.cateringAnalysis.marketRange || "N/A", y, brand);
    y = addParagraph(doc, content.cateringAnalysis.rationale, y, pageW, brand);
    if (content.cateringAnalysis.factors?.length) {
      y = addBulletList(doc, content.cateringAnalysis.factors, y, pageW, brand);
    }
  }

  if (content.capRateAnalysis) {
    y = addSectionHeader(doc, "Cap Rate Analysis", y, c(6));
    y = addKeyValue(doc, "Market Range", content.capRateAnalysis.marketRange || "N/A", y, brand);
    y = addKeyValue(doc, "Boutique Range", content.capRateAnalysis.boutiqueRange || "N/A", y, brand);
    y = addKeyValue(doc, "Recommended Range", content.capRateAnalysis.recommendedRange || "N/A", y, brand);
    y = addParagraph(doc, content.capRateAnalysis.rationale, y, pageW, brand);
    if (content.capRateAnalysis.comparables?.length) {
      y = addTable(doc, autoTable, ["Property", "Cap Rate", "Sale Year", "Notes"],
        content.capRateAnalysis.comparables.map((c: any) => [c.name, c.capRate, c.saleYear || "", c.notes || ""]),
        y, c(6), brand);
    }
  }

  if (content.landValueAllocation) {
    y = addSectionHeader(doc, "Land Value Allocation", y, c(7));
    y = addKeyValue(doc, "Recommended Land %", content.landValueAllocation.recommendedPercent || "N/A", y, brand);
    y = addKeyValue(doc, "Market Range", content.landValueAllocation.marketRange || "N/A", y, brand);
    y = addKeyValue(doc, "Assessment Method", content.landValueAllocation.assessmentMethod || "N/A", y, brand);
    y = addParagraph(doc, content.landValueAllocation.rationale, y, pageW, brand);
    if (content.landValueAllocation.factors?.length) {
      y = addBulletList(doc, content.landValueAllocation.factors, y, pageW, brand);
    }
  }

  if (content.competitiveSet?.length) {
    y = addSectionHeader(doc, "Competitive Set", y, c(8));
    y = addTable(doc, autoTable, ["Property", "Rooms", "ADR", "Positioning"],
      content.competitiveSet.map((c: any) => [c.name, String(c.rooms || ""), c.adr || "", c.positioning || ""]),
      y, c(0), brand);
  }

  if (content.risks?.length) {
    y = addSectionHeader(doc, "Risks & Mitigations", y, brand.PRIMARY_RGB);
    y = addTable(doc, autoTable, ["Risk", "Mitigation"],
      content.risks.map((r: any) => [r.risk, r.mitigation]),
      y, brand.PRIMARY_RGB, brand);
  }

  if (content.sources?.length) {
    y = addSectionHeader(doc, "Sources", y, brand.MUTED_RGB);
    y = addBulletList(doc, content.sources, y, pageW, brand);
  }

  return y;
}

export function renderGlobalResearch(doc: any, autoTable: any, content: any, y: number, pageW: number, brand: BrandPalette): number {
  const colors = sectionColors(brand);
  const c = (i: number) => colors[i % colors.length];

  if (content.industryOverview) {
    y = addSectionHeader(doc, "Industry Overview", y, c(0));
    if (content.industryOverview.marketSize) y = addKeyValue(doc, "Market Size", content.industryOverview.marketSize, y, brand);
    if (content.industryOverview.growthRate) y = addKeyValue(doc, "Growth Rate", content.industryOverview.growthRate, y, brand);
    if (content.industryOverview.boutiqueShare) y = addKeyValue(doc, "Boutique Share", content.industryOverview.boutiqueShare, y, brand);
    if (content.industryOverview.keyTrends?.length) {
      y = addBulletList(doc, content.industryOverview.keyTrends, y, pageW, brand);
    }
  }

  if (content.eventHospitality) {
    y = addSectionHeader(doc, "Event Hospitality", y, c(1));
    const segments = ["wellnessRetreats", "corporateEvents", "yogaRetreats", "relationshipRetreats"];
    for (const seg of segments) {
      const data = content.eventHospitality[seg];
      if (data) {
        const label = seg.replace(/([A-Z])/g, ' $1').trim();
        if (data.marketSize) y = addKeyValue(doc, `${label} — Market Size`, data.marketSize, y, brand);
        if (data.growth) y = addKeyValue(doc, `${label} — Growth`, data.growth, y, brand);
      }
    }
  }

  if (content.financialBenchmarks) {
    y = addSectionHeader(doc, "Financial Benchmarks", y, c(2));
    if (content.financialBenchmarks.adrTrends?.length) {
      y = addTable(doc, autoTable, ["Year", "National", "Boutique", "Luxury"],
        content.financialBenchmarks.adrTrends.map((t: any) => [t.year, t.national, t.boutique || "", t.luxury || ""]),
        y, c(2), brand);
    }
    if (content.financialBenchmarks.occupancyTrends?.length) {
      y = addTable(doc, autoTable, ["Year", "National", "Boutique", "Luxury"],
        content.financialBenchmarks.occupancyTrends.map((t: any) => [t.year, t.national, t.boutique || "", t.luxury || ""]),
        y, c(2), brand);
    }
  }

  if (content.investmentReturns) {
    y = addSectionHeader(doc, "Investment Returns", y, c(3));
    if (content.investmentReturns.capRates) {
      const cr = content.investmentReturns.capRates;
      if (cr.economyMidscale) y = addKeyValue(doc, "Economy/Midscale Cap Rate", cr.economyMidscale, y, brand);
      if (cr.upscale) y = addKeyValue(doc, "Upscale Cap Rate", cr.upscale, y, brand);
      if (cr.luxury) y = addKeyValue(doc, "Luxury Cap Rate", cr.luxury, y, brand);
      if (cr.boutique) y = addKeyValue(doc, "Boutique Cap Rate", cr.boutique, y, brand);
    }
  }

  if (content.debtMarket) {
    y = addSectionHeader(doc, "Debt Market", y, c(4));
    if (content.debtMarket.currentConditions) y = addParagraph(doc, content.debtMarket.currentConditions, y, pageW, brand);
    if (content.debtMarket.typicalTerms?.length) {
      y = addTable(doc, autoTable, ["Term", "Value"],
        content.debtMarket.typicalTerms.map((t: any) => [t.term, t.value]),
        y, c(4), brand);
    }
  }

  if (content.emergingTrends?.length) {
    y = addSectionHeader(doc, "Emerging Trends", y, c(5));
    y = addBulletList(doc, content.emergingTrends.map((t: any) => typeof t === 'string' ? t : `${t.trend}: ${t.description}`), y, pageW, brand);
  }

  if (content.sources?.length) {
    y = addSectionHeader(doc, "Sources", y, brand.MUTED_RGB);
    y = addBulletList(doc, content.sources, y, pageW, brand);
  }

  return y;
}

export function renderCompanyResearch(doc: any, autoTable: any, content: any, y: number, pageW: number, brand: BrandPalette): number {
  const colors = sectionColors(brand);
  const c = (i: number) => colors[i % colors.length];

  if (content.managementFees) {
    y = addSectionHeader(doc, "Management Fees", y, c(0));
    if (content.managementFees.baseFee) {
      const bf = content.managementFees.baseFee;
      y = addKeyValue(doc, "Industry Range", bf.industryRange || "N/A", y, brand);
      y = addKeyValue(doc, "Boutique Range", bf.boutiqueRange || "N/A", y, brand);
      y = addKeyValue(doc, "Recommended", bf.recommended || "N/A", y, brand);
      if (bf.gaapReference) y = addKeyValue(doc, "GAAP Reference", bf.gaapReference, y, brand);
    }
    if (content.managementFees.incentiveFee) {
      y += 2;
      const inf = content.managementFees.incentiveFee;
      y = addKeyValue(doc, "Incentive Fee Range", inf.industryRange || "N/A", y, brand);
      y = addKeyValue(doc, "Common Basis", inf.commonBasis || "N/A", y, brand);
      y = addKeyValue(doc, "Recommended", inf.recommended || "N/A", y, brand);
    }
  }

  if (content.gaapStandards?.length) {
    y = addSectionHeader(doc, "GAAP Standards", y, c(1));
    y = addTable(doc, autoTable, ["Standard", "Reference", "Application"],
      content.gaapStandards.map((s: any) => [s.standard, s.reference, s.application]),
      y, c(1), brand);
  }

  if (content.industryBenchmarks) {
    y = addSectionHeader(doc, "Industry Benchmarks", y, c(2));
    if (content.industryBenchmarks.operatingExpenseRatios?.length) {
      y = addTable(doc, autoTable, ["Category", "Range", "Source"],
        content.industryBenchmarks.operatingExpenseRatios.map((r: any) => [r.category, r.range, r.source || ""]),
        y, c(2), brand);
    }
  }

  if (content.compensationBenchmarks) {
    y = addSectionHeader(doc, "Compensation Benchmarks", y, c(3));
    const cb = content.compensationBenchmarks;
    if (cb.gm) y = addKeyValue(doc, "General Manager", cb.gm, y, brand);
    if (cb.director) y = addKeyValue(doc, "Director", cb.director, y, brand);
    if (cb.manager) y = addKeyValue(doc, "Manager", cb.manager, y, brand);
    if (cb.source) y = addKeyValue(doc, "Source", cb.source, y, brand);
  }

  if (content.contractTerms?.length) {
    y = addSectionHeader(doc, "Contract Terms", y, c(4));
    y = addTable(doc, autoTable, ["Term", "Typical", "Notes"],
      content.contractTerms.map((t: any) => [t.term, t.typical, t.notes || ""]),
      y, c(4), brand);
  }

  if (content.sources?.length) {
    y = addSectionHeader(doc, "Sources", y, brand.MUTED_RGB);
    y = addBulletList(doc, content.sources, y, pageW, brand);
  }

  return y;
}

export function renderPromptConditions(doc: any, conditions: Record<string, any>, y: number, pageW: number, brand: BrandPalette): number {
  y = addSectionHeader(doc, "Research Conditions", y, brand.SECONDARY_RGB);

  doc.setFillColor(...brand.SURFACE_RGB);
  doc.roundedRect(14, y - 2, pageW - 28, 4, 1, 1, "F");

  if (conditions.generatedAt) {
    const d = new Date(conditions.generatedAt);
    y = addKeyValue(doc, "Generated", d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }), y, brand);
  }
  if (conditions.llmModel) y = addKeyValue(doc, "AI Model", conditions.llmModel, y, brand);
  if (conditions.propertyLabel) y = addKeyValue(doc, "Property Type", conditions.propertyLabel, y, brand);
  if (conditions.inflationRate !== undefined) y = addKeyValue(doc, "Inflation Rate", `${conditions.inflationRate}%`, y, brand);
  if (conditions.projectionYears) y = addKeyValue(doc, "Projection Years", String(conditions.projectionYears), y, brand);
  if (conditions.timeHorizon) y = addKeyValue(doc, "Time Horizon", conditions.timeHorizon, y, brand);

  if (conditions.propertyContext) {
    const pc = conditions.propertyContext;
    const parts = [];
    if (pc.name) parts.push(pc.name);
    if (pc.location) parts.push(pc.location);
    if (pc.market) parts.push(pc.market);
    if (pc.roomCount) parts.push(`${pc.roomCount} rooms`);
    if (pc.startAdr) parts.push(`$${pc.startAdr} ADR`);
    if (parts.length) y = addKeyValue(doc, "Property", parts.join(" · "), y, brand);
  }

  if (conditions.assetDefinition) {
    const ad = conditions.assetDefinition;
    const parts = [];
    if (ad.level) parts.push(`Tier: ${ad.level}`);
    if (ad.minRooms && ad.maxRooms) parts.push(`${ad.minRooms}–${ad.maxRooms} rooms`);
    if (ad.minAdr && ad.maxAdr) parts.push(`$${ad.minAdr}–$${ad.maxAdr} ADR`);
    if (ad.hasFB) parts.push("F&B");
    if (ad.hasEvents) parts.push("Events");
    if (ad.hasWellness) parts.push("Wellness");
    if (parts.length) y = addKeyValue(doc, "Asset Definition", parts.join(", "), y, brand);
  }

  if (conditions.focusAreas?.length) {
    y = addKeyValue(doc, "Focus Areas", conditions.focusAreas.join(", "), y, brand);
  }
  if (conditions.regions?.length) {
    y = addKeyValue(doc, "Target Regions", conditions.regions.join(", "), y, brand);
  }
  if (conditions.customQuestions) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...brand.MUTED_RGB);
    doc.text("Custom Research Questions:", 18, y);
    y += 4;
    const questions = conditions.customQuestions.split("\n").filter((q: string) => q.trim());
    y = addBulletList(doc, questions, y, pageW, brand);
  }

  doc.setDrawColor(...brand.BORDER_RGB);
  doc.setLineWidth(0.3);
  doc.line(14, y, pageW - 14, y);
  return y + 6;
}

async function buildResearchDoc(options: ResearchExportOptions) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const brand = buildBrandPalette(options.themeColors);
  const branding = options.branding || await fetchBranding();

  let logoDataUrl: string | null = null;
  if (branding.logoUrl) {
    logoDataUrl = await loadLogoImage(branding.logoUrl);
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_DIMS.PORTRAIT_W, PAGE_DIMS.PORTRAIT_H] });
  const pageW = doc.internal.pageSize.getWidth();

  const headerH = 60;
  brandedHeader(doc, pageW, headerH, brand);

  const textStartX = 14;
  let logoEndX = textStartX;

  if (logoDataUrl) {
    try {
      const logoH = 18;
      const logoW = 18;
      doc.addImage(logoDataUrl, "PNG", 14, 8, logoW, logoH);
      logoEndX = 14 + logoW + 4;
    } catch {
      logoEndX = textStartX;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...brand.WHITE_RGB);
  doc.text(branding.companyName, logoEndX, 20);

  if (branding.userName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...brand.SURFACE_RGB);
    doc.text(`Prepared for: ${branding.userName}`, logoEndX, 26);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...brand.ACCENT_RGB);
  doc.text(options.title, 14, 38);
  if (options.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(...brand.MUTED_RGB);
    doc.text(options.subtitle, 14, 45);
  }
  doc.setFontSize(8);
  doc.setTextColor(...brand.BORDER_RGB);
  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  const meta = [`Generated: ${dateTimeStr}`];
  if (options.updatedAt) {
    const resDate = new Date(options.updatedAt);
    meta.push(`Research date: ${resDate.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}`);
  }
  if (options.llmModel) meta.push(`Model: ${options.llmModel}`);
  doc.text(meta.join(" | "), 14, 54);

  let y = 70;

  if (options.promptConditions) {
    y = renderPromptConditions(doc, options.promptConditions, y, pageW, brand);
  }

  if (options.type === "property") {
    y = renderPropertyResearch(doc, autoTable, options.content, y, pageW, brand);
  } else if (options.type === "global") {
    y = renderGlobalResearch(doc, autoTable, options.content, y, pageW, brand);
  } else if (options.type === "company") {
    y = renderCompanyResearch(doc, autoTable, options.content, y, pageW, brand);
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...brand.PRIMARY_RGB);
    doc.rect(0, pageH - 14, pageW, 14, "F");
    doc.setFillColor(...brand.ACCENT_RGB);
    doc.rect(0, pageH - 14, pageW, 0.5, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...brand.SURFACE_RGB);
    doc.text(`${branding.companyName} — Confidential`, 14, pageH - 6);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...brand.ACCENT_RGB);
    doc.text("Powered by Norfolk AI", pageW / 2, pageH - 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...brand.SURFACE_RGB);
    doc.text(`Page ${i} of ${totalPages}`, pageW - 14, pageH - 6, { align: "right" });
  }

  return doc;
}

export async function downloadResearchPDF(options: ResearchExportOptions, customFilename?: string): Promise<void> {
  const { saveFile } = await import("./saveFile");
  const doc = await buildResearchDoc(options);
  const filename = customFilename || `${options.title.replace(/[^a-zA-Z0-9]/g, "_")}_Research.pdf`;
  const blob = doc.output("blob");
  await saveFile(blob, filename);
}
