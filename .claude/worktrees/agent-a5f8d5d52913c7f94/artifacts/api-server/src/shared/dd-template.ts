/**
 * Canonical hospitality due-diligence template.
 *
 * The template is versioned in code so a Specialist or admin only needs to
 * bump TEMPLATE_VERSION and edit `HOSPITALITY_DD_TEMPLATE` to add a new
 * workstream item — per-property data is unaffected.
 *
 * The catalog is mirrored into the `dd_template_items` table on startup
 * (see `server/storage/property-dd.ts`); admins can override per-row
 * defaults from the Admin > Constants > Due Diligence Template page
 * without a code change. New rows in the code template are inserted; rows
 * removed from the code template are kept in the DB and marked `archived`
 * so existing per-property instances don't lose their workstream.
 */

export const DD_TEMPLATE_VERSION = 1;

export const DD_WORKSTREAMS = [
  "title-survey",
  "environmental",
  "physical",
  "brand-pip",
  "operations-permits",
  "employment-labor",
  "insurance-risk",
  "financial-tax",
  "contracts-assignability",
  "legal-litigation",
] as const;
export type DdWorkstream = typeof DD_WORKSTREAMS[number];

export const DD_WORKSTREAM_LABELS: Record<DdWorkstream, string> = {
  "title-survey": "Title & Survey",
  "environmental": "Environmental",
  "physical": "Physical",
  "brand-pip": "Brand & PIP",
  "operations-permits": "Operations & Permits",
  "employment-labor": "Employment & Labor",
  "insurance-risk": "Insurance & Risk",
  "financial-tax": "Financial & Tax",
  "contracts-assignability": "Contracts & Assignability",
  "legal-litigation": "Legal & Litigation",
};

export const DD_STATUSES = ["not_started", "in_progress", "complete", "blocked", "na"] as const;
export type DdStatus = typeof DD_STATUSES[number];

export const DD_STATUS_LABELS: Record<DdStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  blocked: "Blocked",
  na: "N/A",
};

export const DD_GO_INDICATORS = ["go", "caution", "stop"] as const;
export type DdGoIndicator = typeof DD_GO_INDICATORS[number];

export interface DdTemplateItem {
  /** Stable kebab-case key — survives DB rebuilds, used to dedupe seeds. */
  key: string;
  workstream: DdWorkstream;
  label: string;
  /** Plain-language explanation surfaced as a tooltip / help text. */
  description: string;
  /** When true, an unresolved `blocked` status pushes the deal to "Stop". */
  isStopGate: boolean;
  /** Default vendor type (e.g. "Title insurer", "Phase I consultant"). */
  defaultVendorType?: string;
  /** Order within its workstream — lower values render first. */
  sortOrder: number;
}

/**
 * The canonical hospitality DD checklist. Items are grouped by workstream
 * and rendered in the order they appear here within each workstream.
 *
 * Items flagged `isStopGate: true` drive the deal-level Go/Caution/Stop
 * badge: a `blocked` status on any stop-gate item promotes the deal to
 * "Stop" until the finding is cleared.
 */
export const HOSPITALITY_DD_TEMPLATE: readonly DdTemplateItem[] = [
  // Title & Survey
  { key: "alta-survey", workstream: "title-survey", label: "ALTA / NSPS Survey", description: "Boundary, easements, encroachments, and access. Required by lenders and title insurers.", isStopGate: false, defaultVendorType: "Surveyor", sortOrder: 10 },
  { key: "title-commitment", workstream: "title-survey", label: "Title commitment & endorsements", description: "Pro-forma title policy with required endorsements (zoning, access, contiguity).", isStopGate: true, defaultVendorType: "Title insurer", sortOrder: 20 },
  { key: "zoning-report", workstream: "title-survey", label: "Zoning report (PZR or equivalent)", description: "Confirms hospitality use is permitted; flags non-conforming uses & rebuild risk.", isStopGate: true, defaultVendorType: "Zoning consultant", sortOrder: 30 },

  // Environmental
  { key: "phase-1-esa", workstream: "environmental", label: "Phase I Environmental Site Assessment", description: "ASTM E1527 review; presence of any RECs (recognized environmental conditions).", isStopGate: true, defaultVendorType: "Environmental consultant", sortOrder: 10 },
  { key: "phase-2-esa", workstream: "environmental", label: "Phase II ESA (if RECs found)", description: "Subsurface sampling triggered by Phase I findings.", isStopGate: false, defaultVendorType: "Environmental consultant", sortOrder: 20 },
  { key: "asbestos-lead-radon", workstream: "environmental", label: "Asbestos / lead / radon survey", description: "Pre-1980 buildings; required prior to any disruptive PIP work.", isStopGate: false, defaultVendorType: "Environmental consultant", sortOrder: 30 },
  { key: "wetlands-delineation", workstream: "environmental", label: "Wetlands / floodplain delineation", description: "Wetlands jurisdiction and FEMA flood zone confirmation.", isStopGate: false, defaultVendorType: "Environmental consultant", sortOrder: 40 },

  // Physical
  { key: "structural-mep-pca", workstream: "physical", label: "Structural / MEP property condition assessment", description: "PCA covering structure, roof, MEP systems, life-safety; 5-year capital reserve schedule.", isStopGate: true, defaultVendorType: "Engineering firm", sortOrder: 10 },
  { key: "ada-audit", workstream: "physical", label: "ADA / accessibility audit", description: "Title III public-accommodations compliance; quantifies remediation cost.", isStopGate: false, defaultVendorType: "ADA consultant", sortOrder: 20 },
  { key: "seismic-pml", workstream: "physical", label: "Seismic PML (Probable Maximum Loss)", description: "Required in Seismic Zones 3-4; lender threshold typically PML ≤ 20%.", isStopGate: false, defaultVendorType: "Engineering firm", sortOrder: 30 },
  { key: "roof-elevator-fls", workstream: "physical", label: "Roof, elevator, fire/life-safety inspections", description: "Specialty inspections; remaining useful life and code-compliance gaps.", isStopGate: false, defaultVendorType: "Specialty inspectors", sortOrder: 40 },

  // Brand & PIP
  { key: "brand-pip-scope", workstream: "brand-pip", label: "Brand PIP scope & cost", description: "Property Improvement Plan from the brand; line-item cost and timeline.", isStopGate: true, defaultVendorType: "Brand", sortOrder: 10 },
  { key: "brand-application-approval", workstream: "brand-pip", label: "Franchise / brand application approval", description: "Application, key-money negotiation, area protection, term & exit fees.", isStopGate: true, defaultVendorType: "Brand", sortOrder: 20 },
  { key: "fft-ffe-budget", workstream: "brand-pip", label: "FF&E + soft-goods budget vs. brand standards", description: "Confirms PIP allowance covers brand standards in current pricing.", isStopGate: false, sortOrder: 30 },

  // Operations & Permits
  { key: "co-occupancy", workstream: "operations-permits", label: "Certificate of Occupancy verification", description: "Current CO matches as-built and intended use; no open violations.", isStopGate: false, sortOrder: 10 },
  { key: "liquor-license", workstream: "operations-permits", label: "Liquor license transferability", description: "License type, transferability, escrow, and interim management agreement (if needed).", isStopGate: true, defaultVendorType: "Beverage counsel", sortOrder: 20 },
  { key: "lodging-tax-compliance", workstream: "operations-permits", label: "Lodging / occupancy tax compliance", description: "Historical filings, audit exposure, registration in destination jurisdictions.", isStopGate: false, sortOrder: 30 },
  { key: "health-permits", workstream: "operations-permits", label: "Health, pool, and elevator permits", description: "Active permits; outstanding health-department citations.", isStopGate: false, sortOrder: 40 },

  // Employment & Labor
  { key: "warn-act", workstream: "employment-labor", label: "WARN Act exposure", description: "Federal/state plant-closing exposure if material headcount change at closing.", isStopGate: false, sortOrder: 10 },
  { key: "union-cba", workstream: "employment-labor", label: "Union / CBA review", description: "Existing collective bargaining agreement; successor obligations and pension liability.", isStopGate: true, defaultVendorType: "Labor counsel", sortOrder: 20 },
  { key: "i9-eeoc", workstream: "employment-labor", label: "I-9 / EEOC compliance review", description: "Sample audit of work-authorization and EEOC records; exposure window.", isStopGate: false, sortOrder: 30 },

  // Insurance & Risk
  { key: "wind-flood-policy", workstream: "insurance-risk", label: "Wind & flood insurance bindable quote", description: "Confirms named-storm, flood, and earthquake coverage is bindable at modeled premium.", isStopGate: true, defaultVendorType: "Broker", sortOrder: 10 },
  { key: "loss-runs", workstream: "insurance-risk", label: "5-year loss runs", description: "Property + general liability + workers comp loss history.", isStopGate: false, sortOrder: 20 },
  { key: "cyber-pii", workstream: "insurance-risk", label: "Cyber & PII breach exposure", description: "PMS / loyalty data handling; cyber policy limits.", isStopGate: false, sortOrder: 30 },

  // Financial & Tax
  { key: "qoe", workstream: "financial-tax", label: "Quality of Earnings (QoE)", description: "Independent review of trailing 12-month P&L, normalizations, and run-rate EBITDA.", isStopGate: true, defaultVendorType: "Accounting firm", sortOrder: 10 },
  { key: "tax-cert", workstream: "financial-tax", label: "Tax certificate (sales, lodging, property)", description: "Successor-liability clearance from state revenue agencies.", isStopGate: false, sortOrder: 20 },
  { key: "property-tax-reassessment", workstream: "financial-tax", label: "Property-tax reassessment risk", description: "Likelihood and magnitude of post-sale reassessment in this jurisdiction.", isStopGate: false, sortOrder: 30 },

  // Contracts & Assignability
  { key: "ota-contracts", workstream: "contracts-assignability", label: "OTA & GDS contract assignability", description: "Booking.com, Expedia, GDS, channel manager — assignability and any rate-parity carve-outs.", isStopGate: false, sortOrder: 10 },
  { key: "vendor-service-contracts", workstream: "contracts-assignability", label: "Vendor & service contract review", description: "Material vendor contracts (laundry, F&B, telecom); termination / assignment terms.", isStopGate: false, sortOrder: 20 },
  { key: "ground-lease", workstream: "contracts-assignability", label: "Ground lease / leasehold review", description: "If leasehold: term, rent steps, lender consent, financing clause.", isStopGate: true, defaultVendorType: "Real-estate counsel", sortOrder: 30 },

  // Legal & Litigation
  { key: "litigation-search", workstream: "legal-litigation", label: "Litigation & lien search", description: "Pending litigation, judgments, mechanic liens against seller / property.", isStopGate: false, defaultVendorType: "Search firm", sortOrder: 10 },
  { key: "regulatory-actions", workstream: "legal-litigation", label: "Regulatory actions & consent decrees", description: "Open enforcement actions or consent decrees affecting the property or seller.", isStopGate: true, defaultVendorType: "Counsel", sortOrder: 20 },
];

export interface DdSummary {
  totalItems: number;
  completedItems: number;
  blockedItems: number;
  blockedStopGateItems: number;
  /** Workstream rollups in template order. */
  workstreams: Array<{
    workstream: DdWorkstream;
    label: string;
    total: number;
    completed: number;
    blocked: number;
    percentComplete: number;
  }>;
  /** Sum of cost estimates across all in-scope items (NOT N/A). */
  budgetTotal: number;
  /** Sum of cost actuals across all in-scope items. */
  spendCommitted: number;
  /** Plain-text reason string explaining why we landed on this indicator. */
  goIndicator: DdGoIndicator;
  goReason: string;
  /** Open findings (status != complete and finding text present). */
  openFindings: Array<{
    itemKey: string;
    label: string;
    workstream: DdWorkstream;
    status: DdStatus;
    findings: string;
  }>;
}
