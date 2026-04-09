import type { ResearchSourceEntry } from "@shared/schema";

export interface IcpLocationCity {
  name: string;
  radius: number;
}

export interface IcpLocation {
  id: string;
  country: string;
  countryCode: string;
  states: string[];
  cities: IcpLocationCity[];
  notes: string;
}

export interface IcpResearchReport {
  generatedAt: string;
  model: string;
  sections: IcpResearchSection[];
  extractedMetrics: Record<string, any>;
}

export interface IcpResearchSection {
  title: string;
  locationKey?: string;
  content: string;
}

export interface PromptBuilderConfig {
  questions?: { id: string; question: string; sortOrder: number }[];
  additionalInstructions?: string;
  context?: {
    location?: boolean;
    propertyProfile?: boolean;
    propertyDescription?: boolean;
    questions?: boolean;
    additionalInstructions?: boolean;
    financialResults?: boolean;
  };
}

export function buildIcpResearchPrompt(
  icpConfig: Record<string, unknown>,
  assetDescription: string,
  propertyLabel: string,
  promptBuilder?: PromptBuilderConfig,
  financialSummary?: string,
  companySources?: ResearchSourceEntry[],
): string {
  const ctx = promptBuilder?.context ?? {
    location: true, propertyProfile: true, propertyDescription: true,
    questions: true, additionalInstructions: true, financialResults: false,
  };

  const locations = (icpConfig._locations || []) as IcpLocation[];
  const descriptive = (icpConfig._descriptive || {}) as Record<string, string>;
  const sources = icpConfig._sources as { urls?: any[]; files?: any[]; allowUnrestricted?: boolean } | undefined;

  let locationBlock = "";
  if (ctx.location !== false) {
    locationBlock = locations.length > 0
      ? locations.map((loc) => {
          const cities = loc.cities.map((c) => `${c.name} (${c.radius}mi radius)`).join(", ");
          const notes = loc.notes ? `\n  Additional context: ${loc.notes}` : "";
          return `- ${loc.country} > ${loc.states.join(", ")} > Cities: ${cities}${notes}`;
        }).join("\n")
      : "No specific locations defined.";
  }

  let sourcesBlock = "";
  {
    const urlList = (sources?.urls || []).map((u: any) => `- ${u.label}: ${u.url}`).join("\n");
    const fileList = (sources?.files || []).map((f: any) => {
      return `- [Uploaded] ${f.name}`;
    }).join("\n");
    const companySrcList = (companySources || []).map((s) => `- ${s.label}: ${s.url}`).join("\n");
    if (urlList || fileList || companySrcList) {
      const restriction = sources?.allowUnrestricted
        ? "You may also search beyond these sources when needed."
        : "IMPORTANT: You MUST restrict your research to ONLY the sources listed below. Do not reference or cite information from any other sources.";
      sourcesBlock = `\n═══ REFERENCE SOURCES ═══\n${restriction}\n${urlList ? `\nURLs:\n${urlList}` : ""}${companySrcList ? `\nCompany Research Sources:\n${companySrcList}` : ""}${fileList ? `\nFiles:\n${fileList}` : ""}\n`;
    }
  }

  let questionsBlock = "";
  if (ctx.questions !== false && promptBuilder?.questions && promptBuilder.questions.length > 0) {
    const qs = promptBuilder.questions
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join("\n");
    questionsBlock = `\n═══ RESEARCH QUESTIONS TO ANSWER ═══\nThe research report MUST answer each of the following questions with specific data and analysis:\n${qs}\n`;
  }

  let instructionsBlock = "";
  if (ctx.additionalInstructions !== false && promptBuilder?.additionalInstructions?.trim()) {
    instructionsBlock = `\n═══ ADDITIONAL INSTRUCTIONS ═══\n${promptBuilder.additionalInstructions.trim()}\n`;
  }

  let financialBlock = "";
  if (ctx.financialResults !== false && financialSummary) {
    financialBlock = `\n═══ MANAGEMENT COMPANY FINANCIAL RESULTS ═══\nThe following financial performance data represents the management company's current position. Use this to assess how the company's financial health affects ICP attractiveness, investor appeal, and competitive positioning.\n${financialSummary}\n`;
  }

  let profileBlock = "";
  if (ctx.propertyProfile !== false) {
    profileBlock = `\n═══ PROPERTY PROFILE PARAMETERS ═══
Room count range: ${icpConfig.roomsMin || "N/A"}–${icpConfig.roomsMax || "N/A"}
Sweet spot: ${icpConfig.roomsSweetSpotMin || "N/A"}–${icpConfig.roomsSweetSpotMax || "N/A"}
F&B Rating: ${icpConfig.fbRating || "N/A"}/5
Land range: ${icpConfig.landAcresMin || "N/A"}–${icpConfig.landAcresMax || "N/A"} acres\n`;
  }

  let descriptionBlock = "";
  if (ctx.propertyDescription !== false) {
    descriptionBlock = `\n═══ PROPERTY TYPES ═══
${descriptive.propertyTypes || "Boutique luxury hotel"}

═══ EXCLUSIONS ═══
${descriptive.exclusions || "None specified"}\n`;
  }

  return `You are a senior hospitality investment research analyst specializing in boutique luxury hotels and resorts. Produce a comprehensive ICP (Ideal Customer Profile) market research report for a hotel management company seeking to acquire or manage properties matching the profile below.

═══ PROPERTY LABEL ═══
${propertyLabel}
${ctx.location !== false ? `\n═══ TARGET LOCATIONS ═══\n${locationBlock}\n` : ""}
═══ ASSET DESCRIPTION / AI PROMPT ═══
${assetDescription || "No asset description provided."}
${profileBlock}${descriptionBlock}${questionsBlock}${instructionsBlock}${financialBlock}${sourcesBlock}

═══ GRANULARITY REQUIREMENTS ═══
Research must be granular and location-specific where it matters:
- ADR: Always presented as a RANGE (low–high). Must vary by specific street, zone, neighborhood within a city when the location definition is that specific. Different sub-markets within the same city can have dramatically different ADR ranges.
- Occupancy: Provide seasonal ranges and annual averages per location/sub-market.
- Commercial loan rates: These are typically statewide, regional, or national — use the appropriate geographic scope.
- Management fees: Provide ranges in both USD and percentage, varying by location/market and property type/amenities.
- Incentive fees: Provide ranges in both USD and percentage, explain how they vary by market conditions and property performance.
- Service fees: For each service the management company provides, give a range in USD and percentage that may vary per location, market, or amenity level.
- Key Performance Indicators: Identify critical KPIs for the business in each market.
- Competitive landscape: Identify competitive or adjacent companies in each prospect property location/market.
- Operating costs: USALI-based benchmarks that vary by location, property size, and service level.

═══ REPORT STRUCTURE ═══
Produce the report in the following JSON format:
{
  "generalMarket": {
    "title": "General Market Overview",
    "content": "Multi-paragraph analysis of the boutique luxury hotel market nationally/globally — trends, ADR benchmarks (as ranges), occupancy patterns, cap rates, investor sentiment, regulatory environment, competitive landscape, and fee structures. NOT location-specific."
  },
  "locations": [
    {
      "locationKey": "Country > State > City/Zone",
      "title": "Market Analysis: [Location Name]",
      "content": "Deep dive for this specific market including: local demand drivers and tourism statistics, seasonality analysis, competitive set with named competitors, ADR ranges by sub-market/zone, occupancy benchmarks (seasonal and annual), RevPAR analysis, land and acquisition cost ranges, management fee ranges (USD and %), incentive fee ranges (USD and %), service fee ranges for each service (USD and %), commercial lending rates and terms, development pipeline, regulatory/tax considerations, key performance indicators, and opportunity assessment. Be as granular as the location specificity allows."
    }
  ],
  "conclusion": {
    "title": "Conclusion & Strategic Recommendations",
    "content": "Synthesis including: ranked location attractiveness, risk/reward per market, fee structure recommendations per location, competitive positioning strategy, KPI targets by market, timing considerations, and actionable next steps."
  },
  "extractedMetrics": {
    "nationalAvgAdr": { "value": 0, "unit": "USD", "range": "low-high", "description": "National average ADR range for boutique luxury segment" },
    "nationalAvgOccupancy": { "value": 0, "unit": "%", "description": "National average occupancy rate" },
    "nationalAvgRevPAR": { "value": 0, "unit": "USD", "description": "National average RevPAR" },
    "avgCapRate": { "value": 0, "unit": "%", "description": "Average cap rate for boutique luxury hotels" },
    "avgManagementFee": { "value": 0, "unit": "%", "range": "low-high", "description": "Average management fee percentage range" },
    "avgIncentiveFee": { "value": 0, "unit": "%", "range": "low-high", "description": "Average incentive fee percentage range" },
    "locationMetrics": [
      {
        "location": "Location name",
        "avgAdr": { "value": 0, "unit": "USD", "range": "low-high" },
        "avgOccupancy": { "value": 0, "unit": "%" },
        "avgRevPAR": { "value": 0, "unit": "USD" },
        "capRate": { "value": 0, "unit": "%" },
        "avgLandCostPerAcre": { "value": 0, "unit": "USD" },
        "demandGrowthRate": { "value": 0, "unit": "%" },
        "managementFeeRange": { "value": 0, "unit": "%", "range": "low-high" },
        "incentiveFeeRange": { "value": 0, "unit": "%", "range": "low-high" },
        "competitiveIntensity": "low|medium|high",
        "investmentRating": "A+|A|B+|B|C",
        "keyCompetitors": ["Company A", "Company B"]
      }
    ]
  }
}

IMPORTANT:
- Use real market data and current industry benchmarks. Base your analysis on actual hospitality industry reports, STR data patterns, and real estate investment metrics.
- All numeric values in extractedMetrics must be realistic numbers, not placeholders.
- ADR values MUST be presented as ranges (e.g., "$250-$450") reflecting the specific sub-market granularity.
- Fee structures (management, incentive, service) MUST include both USD amounts and percentages as ranges.
- Each location section should be 4-8 substantial paragraphs covering all required granular topics.
- The general market section should be 4-6 paragraphs.
- The conclusion should be 3-5 paragraphs.
- Return ONLY valid JSON, no markdown fences or extra text.`;
}

export function buildMarkdownFromReport(report: IcpResearchReport, propertyLabel: string): string {
  const lines: string[] = [];
  lines.push(`# ICP Market Research Report — ${propertyLabel}`);
  lines.push(`*Generated: ${new Date(report.generatedAt).toLocaleString()} | Model: ${report.model}*`);
  lines.push("");

  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    if (section.locationKey) lines.push(`*Location: ${section.locationKey}*`);
    lines.push("");
    lines.push(section.content);
    lines.push("");
  }

  if (report.extractedMetrics && Object.keys(report.extractedMetrics).length > 0) {
    lines.push("## Key Extracted Metrics");
    lines.push("");
    lines.push("| Metric | Value | Unit |");
    lines.push("|--------|-------|------|");
    for (const [key, val] of Object.entries(report.extractedMetrics)) {
      if (key === "locationMetrics") continue;
      if (val && typeof val === "object" && "value" in val) {
        const range = val.range ? ` (${val.range})` : "";
        lines.push(`| ${val.description || key} | ${val.value}${range} | ${val.unit || ""} |`);
      }
    }
    lines.push("");

    if (report.extractedMetrics.locationMetrics && Array.isArray(report.extractedMetrics.locationMetrics)) {
      for (const loc of report.extractedMetrics.locationMetrics) {
        lines.push(`### ${loc.location || "Location"}`);
        lines.push("");
        lines.push("| Metric | Value |");
        lines.push("|--------|-------|");
        const entries: [string, any][] = [
          ["ADR", loc.avgAdr], ["Occupancy", loc.avgOccupancy], ["RevPAR", loc.avgRevPAR],
          ["Cap Rate", loc.capRate], ["Land Cost/Acre", loc.avgLandCostPerAcre],
          ["Demand Growth", loc.demandGrowthRate], ["Management Fee Range", loc.managementFeeRange],
          ["Incentive Fee Range", loc.incentiveFeeRange],
        ];
        for (const [label, metric] of entries) {
          if (metric && typeof metric === "object" && "value" in metric) {
            const range = metric.range ? ` (${metric.range})` : "";
            lines.push(`| ${label} | ${metric.value}${range} ${metric.unit || ""} |`);
          }
        }
        if (loc.competitiveIntensity) lines.push(`| Competitive Intensity | ${loc.competitiveIntensity} |`);
        if (loc.investmentRating) lines.push(`| Investment Rating | ${loc.investmentRating} |`);
        if (loc.keyCompetitors && Array.isArray(loc.keyCompetitors)) {
          lines.push("");
          lines.push(`**Key Competitors:** ${loc.keyCompetitors.join(", ")}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

export function parseResearchResponse(fullContent: string): any {
  try {
    const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : fullContent);
  } catch {
    return { rawResponse: fullContent };
  }
}

export function buildReportFromParsed(parsed: any, model: string): IcpResearchReport {
  const report: IcpResearchReport = {
    generatedAt: new Date().toISOString(),
    model,
    sections: [],
    extractedMetrics: parsed.extractedMetrics || {},
  };

  if (parsed.generalMarket) {
    report.sections.push({
      title: parsed.generalMarket.title || "General Market Overview",
      content: parsed.generalMarket.content || "",
    });
  }

  if (parsed.locations && Array.isArray(parsed.locations)) {
    for (const loc of parsed.locations) {
      report.sections.push({
        title: loc.title || loc.locationKey || "Location Analysis",
        locationKey: loc.locationKey || "",
        content: loc.content || "",
      });
    }
  }

  if (parsed.conclusion) {
    report.sections.push({
      title: parsed.conclusion.title || "Conclusion",
      content: parsed.conclusion.content || "",
    });
  }

  if (parsed.rawResponse) {
    report.sections.push({
      title: "Research Report",
      content: parsed.rawResponse,
    });
  }

  return report;
}

export function buildFinancialSummary(
  ga: any,
  mgmtCompany: any,
  managedProps: any[],
): string {
  const lines: string[] = [];
  if (mgmtCompany) lines.push(`Management Company: ${mgmtCompany.name}`);
  lines.push(`Properties in portfolio: ${managedProps.length}`);
  lines.push(`Base Management Fee: ${((ga.baseManagementFee || 0) * 100).toFixed(1)}%`);
  lines.push(`Incentive Management Fee: ${((ga.incentiveManagementFee || 0) * 100).toFixed(1)}%`);

  for (const p of managedProps) {
    const revPAR = (p.startAdr || 0) * (p.startOccupancy || 0);
    lines.push(`\n--- ${p.name} ---`);
    lines.push(`  Keys: ${p.roomCount || 0}`);
    lines.push(`  Starting ADR: $${(p.startAdr || 0).toFixed(0)}`);
    lines.push(`  Starting Occupancy: ${((p.startOccupancy || 0) * 100).toFixed(0)}%`);
    lines.push(`  ADR Growth Rate: ${((p.adrGrowthRate || 0) * 100).toFixed(1)}%`);
    lines.push(`  RevPAR: $${revPAR.toFixed(0)}`);
  }

  return lines.join("\n");
}

export async function exportReportPdf(
  report: IcpResearchReport,
  propertyLabel: string,
  isLandscape: boolean,
): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const pageDims = isLandscape ? [406.4, 228.6] : [215.9, 279.4];
  const doc = new jsPDF({ orientation: isLandscape ? "l" : "p", unit: "mm", format: pageDims as [number, number] });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addHeader = () => {
    doc.setFillColor(26, 35, 50);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setFillColor(159, 188, 164);
    doc.rect(0, 28, pageW, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("ICP Market Research Report", margin, 18);
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text(propertyLabel, pageW - margin, 18, { align: "right" });
    y = 38;
  };

  const addFooter = (pageNum: number) => {
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(`Page ${pageNum}`, pageW / 2, pageH - 8, { align: "center" });
    doc.text(new Date(report.generatedAt).toLocaleDateString(), pageW - margin, pageH - 8, { align: "right" });
  };

  const checkPage = (needed: number) => {
    if (y + needed > pageH - 15) {
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      addHeader();
    }
  };

  addHeader();

  for (const section of report.sections) {
    checkPage(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(26, 35, 50);
    doc.text(section.title, margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);

    const paragraphs = section.content.split("\n\n").filter(Boolean);
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, contentW);
      for (const line of lines) {
        checkPage(5);
        doc.text(line, margin, y);
        y += 4.5;
      }
      y += 3;
    }
    y += 5;
  }

  if (report.extractedMetrics && Object.keys(report.extractedMetrics).length > 0) {
    checkPage(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(26, 35, 50);
    doc.text("Key Extracted Metrics", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);

    const metrics = report.extractedMetrics;
    for (const [key, val] of Object.entries(metrics)) {
      if (key === "locationMetrics") continue;
      if (val && typeof val === "object" && "value" in val) {
        checkPage(6);
        doc.text(`${val.description || key}: ${val.value} ${val.unit || ""}`, margin + 2, y);
        y += 5;
      }
    }

    if (metrics.locationMetrics && Array.isArray(metrics.locationMetrics)) {
      y += 3;
      for (const loc of metrics.locationMetrics) {
        checkPage(20);
        doc.setFont("helvetica", "bold");
        doc.text(loc.location || "Unknown Location", margin + 2, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        const locEntries = [
          ["ADR", loc.avgAdr],
          ["Occupancy", loc.avgOccupancy],
          ["RevPAR", loc.avgRevPAR],
          ["Cap Rate", loc.capRate],
          ["Land Cost/Acre", loc.avgLandCostPerAcre],
          ["Demand Growth", loc.demandGrowthRate],
        ];
        for (const [label, metric] of locEntries) {
          if (metric && typeof metric === "object" && "value" in metric) {
            checkPage(5);
            doc.text(`  ${label}: ${metric.value} ${metric.unit || ""}`, margin + 4, y);
            y += 4.5;
          }
        }
        if (loc.competitiveIntensity) {
          doc.text(`  Competitive Intensity: ${loc.competitiveIntensity}`, margin + 4, y);
          y += 4.5;
        }
        if (loc.investmentRating) {
          doc.text(`  Investment Rating: ${loc.investmentRating}`, margin + 4, y);
          y += 4.5;
        }
        y += 3;
      }
    }
  }

  addFooter(doc.getNumberOfPages());

  return Buffer.from(doc.output("arraybuffer"));
}

export async function exportReportDocx(
  report: IcpResearchReport,
  propertyLabel: string,
  isLandscape: boolean,
): Promise<Buffer> {
  const docx = await import("docx");
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    PageOrientation, AlignmentType, BorderStyle,
  } = docx;

  const children: any[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: "ICP Market Research Report", bold: true, size: 36, color: "1A2332" })],
      heading: HeadingLevel.TITLE,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `${propertyLabel}  |  Generated: ${new Date(report.generatedAt).toLocaleDateString()}`, size: 18, color: "888888" })],
      spacing: { after: 300 },
      border: { bottom: { color: "9FBCA4", size: 6, style: BorderStyle.SINGLE, space: 8 } },
    }),
  );

  for (const section of report.sections) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.title, bold: true, size: 26, color: "1A2332" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
      }),
    );

    const paragraphs = section.content.split("\n\n").filter(Boolean);
    for (const para of paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: para, size: 20, color: "333333" })],
          spacing: { after: 120 },
          alignment: AlignmentType.JUSTIFIED,
        }),
      );
    }
  }

  if (report.extractedMetrics && Object.keys(report.extractedMetrics).length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Key Extracted Metrics", bold: true, size: 26, color: "1A2332" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
      }),
    );

    const metrics = report.extractedMetrics;
    for (const [key, val] of Object.entries(metrics)) {
      if (key === "locationMetrics") continue;
      if (val && typeof val === "object" && "value" in val) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${val.description || key}: `, bold: true, size: 20, color: "333333" }),
              new TextRun({ text: `${val.value} ${val.unit || ""}`, size: 20, color: "333333" }),
            ],
            spacing: { after: 60 },
          }),
        );
      }
    }

    if (metrics.locationMetrics && Array.isArray(metrics.locationMetrics)) {
      for (const loc of metrics.locationMetrics) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: loc.location || "Location", bold: true, size: 22, color: "257D41" })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 80 },
          }),
        );
        const locEntries = [
          ["ADR", loc.avgAdr],
          ["Occupancy", loc.avgOccupancy],
          ["RevPAR", loc.avgRevPAR],
          ["Cap Rate", loc.capRate],
          ["Land Cost/Acre", loc.avgLandCostPerAcre],
          ["Demand Growth", loc.demandGrowthRate],
          ["Competitive Intensity", loc.competitiveIntensity ? { value: loc.competitiveIntensity, unit: "" } : null],
          ["Investment Rating", loc.investmentRating ? { value: loc.investmentRating, unit: "" } : null],
        ];
        for (const [label, metric] of locEntries) {
          if (metric && typeof metric === "object" && "value" in metric) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `${label}: `, bold: true, size: 18, color: "555555" }),
                  new TextRun({ text: `${metric.value} ${metric.unit || ""}`, size: 18, color: "555555" }),
                ],
                spacing: { after: 40 },
                indent: { left: 360 },
              }),
            );
          }
        }
      }
    }
  }

  const docConfig: any = {
    sections: [{
      properties: {
        page: {
          size: isLandscape
            ? { orientation: PageOrientation.LANDSCAPE }
            : {},
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      children,
    }],
  };

  const docInstance = new Document(docConfig);
  return Buffer.from(await Packer.toBuffer(docInstance));
}
