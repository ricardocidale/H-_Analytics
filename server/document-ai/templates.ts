import type { Property, GlobalAssumptions } from "@shared/schema";
import { DEFAULT_EXIT_CAP_RATE } from "@shared/constants";

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: "legal" | "financial";
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "loi",
    name: "Letter of Intent",
    description: "Non-binding LOI for property acquisition with key terms, purchase price, and conditions",
    category: "legal",
  },
  {
    id: "investment-memo",
    name: "Investment Memo",
    description: "Comprehensive investment analysis summary with financial projections and key metrics",
    category: "financial",
  },
  {
    id: "management-agreement",
    name: "Management Agreement",
    description: "Hotel management agreement outlining operator terms, fees, and performance benchmarks",
    category: "legal",
  },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function renderTemplate(
  templateId: string,
  property: Property,
  globalAssumptions: GlobalAssumptions,
  senderName: string,
  recipientName: string
): { html: string; subject: string } {
  switch (templateId) {
    case "loi":
      return renderLOI(property, globalAssumptions, senderName, recipientName);
    case "investment-memo":
      return renderInvestmentMemo(property, globalAssumptions, senderName);
    case "management-agreement":
      return renderManagementAgreement(property, globalAssumptions, senderName, recipientName);
    default:
      throw new Error(`Unknown template: ${templateId}`);
  }
}

function renderLOI(
  property: Property,
  globalAssumptions: GlobalAssumptions,
  senderName: string,
  recipientName: string
): { html: string; subject: string } {
  const totalInvestment = property.purchasePrice + property.buildingImprovements + property.preOpeningCosts;
  const estimatedNOI = property.purchasePrice * (property.exitCapRate || DEFAULT_EXIT_CAP_RATE);

  const html = `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: 'Georgia', serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; line-height: 1.6; }
  .header { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { font-size: 28px; margin: 0; letter-spacing: 1px; }
  .header p { color: #666; margin: 5px 0 0; }
  .section { margin: 25px 0; }
  .section h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; }
  td:first-child { font-weight: bold; width: 40%; color: #444; }
  .signature { margin-top: 60px; }
  .sig-line { border-top: 1px solid #1a1a1a; width: 250px; margin-top: 50px; padding-top: 5px; }
  .confidential { text-align: center; font-size: 10px; color: #999; margin-top: 40px; text-transform: uppercase; letter-spacing: 2px; }
</style></head>
<body>
  <div class="header">
    <h1>LETTER OF INTENT</h1>
    <p>Non-Binding Expression of Interest</p>
  </div>

  <p>${formatDate()}</p>
  <p>Dear ${recipientName},</p>
  <p>On behalf of <strong>${globalAssumptions.companyName}</strong>, I am pleased to submit this non-binding Letter of Intent regarding the potential acquisition of the property known as <strong>${property.name}</strong>, located at <strong>${property.location}</strong>.</p>

  <div class="section">
    <h2>Property Overview</h2>
    <table>
      <tr><td>Property Name</td><td>${property.name}</td></tr>
      <tr><td>Location</td><td>${property.location}</td></tr>
      <tr><td>Market</td><td>${property.market}</td></tr>
      <tr><td>Room Count</td><td>${property.roomCount} rooms</td></tr>
      <tr><td>Property Status</td><td>${property.status}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Financial Terms</h2>
    <table>
      <tr><td>Purchase Price</td><td>${formatCurrency(property.purchasePrice)}</td></tr>
      <tr><td>Building Improvements</td><td>${formatCurrency(property.buildingImprovements)}</td></tr>
      <tr><td>Pre-Opening Costs</td><td>${formatCurrency(property.preOpeningCosts)}</td></tr>
      <tr><td>Total Investment</td><td>${formatCurrency(totalInvestment)}</td></tr>
      <tr><td>Operating Reserve</td><td>${formatCurrency(property.operatingReserve)}</td></tr>
      <tr><td>Projected Cap Rate</td><td>${formatPercent(property.exitCapRate)}</td></tr>
      <tr><td>Estimated NOI</td><td>${formatCurrency(estimatedNOI)}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Key Conditions</h2>
    <ul>
      <li>Satisfactory completion of due diligence within 60 days of execution</li>
      <li>Satisfactory environmental assessment and property inspection</li>
      <li>Review and approval of all financial records and operating statements</li>
      <li>Successful negotiation and execution of a definitive purchase agreement</li>
      <li>Securing of financing on terms acceptable to Buyer (if applicable)</li>
    </ul>
  </div>

  <div class="section">
    <h2>Timeline</h2>
    <table>
      <tr><td>Target Acquisition Date</td><td>${formatDate(property.acquisitionDate)}</td></tr>
      <tr><td>Operations Start Date</td><td>${formatDate(property.operationsStartDate)}</td></tr>
      <tr><td>Due Diligence Period</td><td>60 days from acceptance</td></tr>
    </table>
  </div>

  <p>This Letter of Intent is non-binding and is intended solely as an expression of interest. It does not create any legally binding obligations on either party. A definitive agreement will be subject to the negotiation of mutually acceptable terms.</p>

  <div class="signature">
    <p>Sincerely,</p>
    <div class="sig-line">/sig1/</div>
    <p>${senderName}<br>${globalAssumptions.companyName}</p>
    <p style="margin-top:10px;">Date: /date1/</p>
  </div>

  <p class="confidential">Confidential &mdash; For Discussion Purposes Only</p>
</body>
</html>`;

  return {
    html,
    subject: `Letter of Intent - ${property.name}`,
  };
}

function renderInvestmentMemo(
  property: Property,
  globalAssumptions: GlobalAssumptions,
  senderName: string
): { html: string; subject: string } {
  const totalInvestment = property.purchasePrice + property.buildingImprovements + property.preOpeningCosts;
  const estimatedRevPAR = property.startAdr * property.startOccupancy;
  const annualRoomRevenue = estimatedRevPAR * property.roomCount * 365;
  const _totalRevenue = annualRoomRevenue * (1 + (property.revShareFB || 0) + (property.revShareEvents || 0) + (property.revShareOther || 0));
  const estimatedNOI = property.purchasePrice * (property.exitCapRate || DEFAULT_EXIT_CAP_RATE);
  const capRate = property.exitCapRate || DEFAULT_EXIT_CAP_RATE;

  const html = `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 850px; margin: 0 auto; padding: 40px; color: #1a1a1a; line-height: 1.6; }
  .header { background: #1a365d; color: white; padding: 30px; margin: -40px -40px 30px; text-align: center; }
  .header h1 { font-size: 26px; margin: 0 0 5px; letter-spacing: 1px; }
  .header .subtitle { font-size: 14px; opacity: 0.8; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
  .kpi { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; }
  .kpi .value { font-size: 22px; font-weight: 700; color: #1a365d; }
  .kpi .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #718096; margin-top: 4px; }
  .section { margin: 30px 0; }
  .section h2 { font-size: 18px; color: #1a365d; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #edf2f7; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; }
  .highlight { background: #fffff0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 12px; color: #718096; text-align: center; }
  .signature { margin-top: 40px; }
  .sig-line { border-top: 1px solid #1a1a1a; width: 250px; margin-top: 50px; padding-top: 5px; }
</style></head>
<body>
  <div class="header">
    <h1>INVESTMENT MEMORANDUM</h1>
    <div class="subtitle">${property.name} &mdash; ${property.location}</div>
    <div class="subtitle">${globalAssumptions.companyName} | ${formatDate()}</div>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="value">${formatCurrency(property.purchasePrice)}</div><div class="label">Purchase Price</div></div>
    <div class="kpi"><div class="value">${property.roomCount}</div><div class="label">Room Count</div></div>
    <div class="kpi"><div class="value">${formatPercent(capRate)}</div><div class="label">Cap Rate</div></div>
    <div class="kpi"><div class="value">${formatCurrency(property.startAdr)}</div><div class="label">Starting ADR</div></div>
  </div>

  <div class="section">
    <h2>Executive Summary</h2>
    <p>${globalAssumptions.companyName} has identified <strong>${property.name}</strong> in <strong>${property.market}</strong> as a compelling investment opportunity. The ${property.roomCount}-room property is offered at ${formatCurrency(property.purchasePrice)}, representing a ${formatPercent(capRate)} cap rate on stabilized NOI of ${formatCurrency(estimatedNOI)}.</p>
    ${property.description ? `<p>${property.description}</p>` : ""}
  </div>

  <div class="section">
    <h2>Investment Overview</h2>
    <table>
      <tr><th colspan="2">Sources & Uses</th></tr>
      <tr><td>Purchase Price</td><td>${formatCurrency(property.purchasePrice)}</td></tr>
      <tr><td>Building Improvements / Renovation</td><td>${formatCurrency(property.buildingImprovements)}</td></tr>
      <tr><td>Pre-Opening Costs</td><td>${formatCurrency(property.preOpeningCosts)}</td></tr>
      <tr><td>Operating Reserve</td><td>${formatCurrency(property.operatingReserve)}</td></tr>
      <tr class="highlight"><td><strong>Total Investment</strong></td><td><strong>${formatCurrency(totalInvestment + property.operatingReserve)}</strong></td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Operating Assumptions</h2>
    <table>
      <tr><th colspan="2">Revenue Drivers</th></tr>
      <tr><td>Starting ADR</td><td>${formatCurrency(property.startAdr)}</td></tr>
      <tr><td>ADR Growth Rate</td><td>${formatPercent(property.adrGrowthRate)}</td></tr>
      <tr><td>Starting Occupancy</td><td>${formatPercent(property.startOccupancy)}</td></tr>
      <tr><td>Max / Stabilized Occupancy</td><td>${formatPercent(property.maxOccupancy)}</td></tr>
      <tr><td>Estimated RevPAR (Year 1)</td><td>${formatCurrency(estimatedRevPAR)}</td></tr>
      <tr><td>Stabilization Period</td><td>${property.occupancyRampMonths} months</td></tr>
    </table>
    <table>
      <tr><th colspan="2">Revenue Composition (% of Room Revenue)</th></tr>
      <tr><td>Food & Beverage</td><td>${formatPercent(property.revShareFB)}</td></tr>
      <tr><td>Events</td><td>${formatPercent(property.revShareEvents)}</td></tr>
      <tr><td>Other Revenue</td><td>${formatPercent(property.revShareOther)}</td></tr>
    </table>
    <table>
      <tr><th colspan="2">Cost Structure (% of Total Revenue)</th></tr>
      <tr><td>Rooms</td><td>${formatPercent(property.costRateRooms)}</td></tr>
      <tr><td>Food & Beverage</td><td>${formatPercent(property.costRateFB)}</td></tr>
      <tr><td>Admin & General</td><td>${formatPercent(property.costRateAdmin)}</td></tr>
      <tr><td>Marketing</td><td>${formatPercent(property.costRateMarketing)}</td></tr>
      <tr><td>Property Ops</td><td>${formatPercent(property.costRatePropertyOps)}</td></tr>
      <tr><td>Utilities</td><td>${formatPercent(property.costRateUtilities)}</td></tr>
      <tr><td>Taxes</td><td>${formatPercent(property.costRateTaxes)}</td></tr>
      <tr><td>IT & Telecom</td><td>${formatPercent(property.costRateIT)}</td></tr>
      <tr><td>FF&E Reserve</td><td>${formatPercent(property.costRateFFE)}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Exit Strategy</h2>
    <table>
      <tr><td>Exit Cap Rate</td><td>${formatPercent(property.exitCapRate)}</td></tr>
      <tr><td>Disposition Commission</td><td>${formatPercent(property.dispositionCommission)}</td></tr>
      <tr><td>Tax Rate</td><td>${formatPercent(property.taxRate)}</td></tr>
    </table>
  </div>

  <div class="signature">
    <p>Prepared by,</p>
    <div class="sig-line">/sig1/</div>
    <p>${senderName}<br>${globalAssumptions.companyName}</p>
    <p style="margin-top:10px;">Date: /date1/</p>
  </div>

  <div class="footer">
    <p>CONFIDENTIAL &mdash; This memorandum is provided for informational purposes only and does not constitute an offer to sell or a solicitation to buy any securities.</p>
    <p>Prepared by ${globalAssumptions.companyName} | ${formatDate()}</p>
  </div>
</body>
</html>`;

  return {
    html,
    subject: `Investment Memo - ${property.name}`,
  };
}

function renderManagementAgreement(
  property: Property,
  globalAssumptions: GlobalAssumptions,
  senderName: string,
  recipientName: string
): { html: string; subject: string } {
  const html = `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: 'Georgia', serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; line-height: 1.8; }
  .header { text-align: center; border-bottom: 3px double #1a1a1a; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { font-size: 24px; margin: 0; letter-spacing: 2px; }
  .section { margin: 25px 0; }
  .section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
  .article { margin: 20px 0; padding-left: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; }
  td:first-child { font-weight: bold; width: 45%; }
  .signature { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sig-block { }
  .sig-line { border-top: 1px solid #1a1a1a; margin-top: 50px; padding-top: 5px; }
</style></head>
<body>
  <div class="header">
    <h1>HOTEL MANAGEMENT AGREEMENT</h1>
    <p>Effective Date: ${formatDate()}</p>
  </div>

  <p>This Hotel Management Agreement ("Agreement") is entered into by and between:</p>
  <p><strong>Manager:</strong> ${globalAssumptions.companyName}<br>
  <strong>Owner:</strong> ${recipientName}</p>
  <p>Regarding the management and operation of the property known as <strong>${property.name}</strong>, located at <strong>${property.location}</strong>.</p>

  <div class="section">
    <h2>Article I - Property Details</h2>
    <table>
      <tr><td>Property Name</td><td>${property.name}</td></tr>
      <tr><td>Location</td><td>${property.location}</td></tr>
      <tr><td>Market</td><td>${property.market}</td></tr>
      <tr><td>Room Count</td><td>${property.roomCount} rooms</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Article II - Management Fees</h2>
    <table>
      <tr><td>Base Management Fee</td><td>${formatPercent(property.baseManagementFeeRate)} of Gross Revenue</td></tr>
      <tr><td>Incentive Management Fee</td><td>${formatPercent(property.incentiveManagementFeeRate)} of Gross Operating Profit</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Article III - Term</h2>
    <p>The initial term of this Agreement shall commence on ${formatDate(property.operationsStartDate)} and continue for a period of ${globalAssumptions.projectionYears} years, unless earlier terminated in accordance with the provisions herein.</p>
  </div>

  <div class="section">
    <h2>Article IV - Performance Benchmarks</h2>
    <table>
      <tr><td>Target ADR (Year 1)</td><td>${formatCurrency(property.startAdr)}</td></tr>
      <tr><td>Target Occupancy (Stabilized)</td><td>${formatPercent(property.maxOccupancy)}</td></tr>
      <tr><td>Stabilization Period</td><td>${property.occupancyRampMonths} months</td></tr>
      <tr><td>Exit Cap Rate Target</td><td>${formatPercent(property.exitCapRate)}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Article V - Operating Budget</h2>
    <p>Manager shall prepare and submit an annual operating budget for Owner's approval no later than sixty (60) days before the start of each fiscal year. The budget shall include projected revenues, expenses, and capital expenditure requirements.</p>
  </div>

  <div class="signature">
    <div class="sig-block">
      <p><strong>MANAGER</strong></p>
      <div class="sig-line">/sig1/</div>
      <p>${senderName}<br>${globalAssumptions.companyName}</p>
      <p>Date: /date1/</p>
    </div>
    <div class="sig-block">
      <p><strong>OWNER</strong></p>
      <div class="sig-line" style="border-top: 1px solid #ccc;">&nbsp;</div>
      <p>${recipientName}</p>
    </div>
  </div>
</body>
</html>`;

  return {
    html,
    subject: `Management Agreement - ${property.name}`,
  };
}
