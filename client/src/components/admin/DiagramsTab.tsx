import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { NodeBox, Arrow, FlowRow, FlowCol, FlowSection } from "@/components/ui/flow-diagram";
import type { FlowNode } from "@/components/ui/flow-diagram";

function DiagramCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-muted/20 rounded-lg p-4 border border-border/40 overflow-auto">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineStep({ arrow = true, ...node }: FlowNode & { arrow?: boolean }) {
  return (
    <>
      <NodeBox node={node} />
      {arrow && <Arrow />}
    </>
  );
}

function DownStep({ arrow = true, ...node }: FlowNode & { arrow?: boolean }) {
  return (
    <>
      <NodeBox node={node} />
      {arrow && <Arrow direction="down" />}
    </>
  );
}

function L1AppFlow() {
  return (
    <FlowRow>
      <PipelineStep id="user" label="User" color="slate" />
      <PipelineStep id="auth" label="Authentication" color="blue" />
      <PipelineStep id="role" label="Role Check" color="purple" variant="diamond" />
      <div className="flex flex-col gap-2">
        <FlowRow>
          <NodeBox node={{ id: "admin", label: "Admin Panel", color: "red" }} />
        </FlowRow>
        <FlowRow>
          <NodeBox node={{ id: "dashboard", label: "Dashboard", color: "blue" }} />
          <Arrow />
          <NodeBox node={{ id: "engine", label: "Financial Engine", color: "green" }} />
          <Arrow />
          <NodeBox node={{ id: "statements", label: "Statements", color: "purple" }} />
          <Arrow />
          <NodeBox node={{ id: "exports", label: "Exports", color: "amber" }} />
        </FlowRow>
      </div>
    </FlowRow>
  );
}

function L1TwoEntity() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FlowSection title="Property SPVs">
          <div className="space-y-2">
            {["Hotel A", "Hotel B", "Hotel C"].map(h => (
              <div key={h} className="flex items-center gap-2">
                <NodeBox node={{ id: h, label: h, color: "blue" }} />
                <span className="text-[10px] text-muted-foreground">→ Base Fee + Incentive Fee</span>
              </div>
            ))}
          </div>
        </FlowSection>
        <FlowSection title="Management Company">
          <FlowCol>
            <DownStep id="feerev" label="Fee Revenue" sublabel="Base + Incentive" color="green" />
            <DownStep id="svcfees" label="Service Fees" sublabel="Per-category" color="green" />
            <DownStep id="opex" label="Operating Expenses" color="amber" />
            <NodeBox node={{ id: "ebitda", label: "ManCo EBITDA", color: "purple" }} />
          </FlowCol>
        </FlowSection>
        <FlowSection title="Consolidated View">
          <FlowCol>
            <DownStep id="elim" label="Intercompany Elimination" sublabel="ManCo fees = SPV expenses" color="red" />
            <NodeBox node={{ id: "portnoi", label: "Portfolio NOI", sublabel: "Net: fees cancel out", color: "green" }} />
          </FlowCol>
        </FlowSection>
      </div>
    </div>
  );
}

function L1Integrations() {
  const categories: { title: string; items: { name: string; desc: string }[] }[] = [
    { title: "AI & LLM", items: [{ name: "Anthropic Claude", desc: "Research & exports" }, { name: "OpenAI", desc: "Embeddings & chat" }, { name: "Google Gemini", desc: "Rebecca advisor" }] },
    { title: "AI Assistants", items: [{ name: "Rebecca", desc: "AI financial advisor" }] },
    { title: "Geospatial", items: [{ name: "Google Maps / Places", desc: "Geocoding & POI" }, { name: "MapLibre GL", desc: "3D globe rendering" }] },
    { title: "Document Intelligence", items: [{ name: "Google Cloud Doc AI", desc: "OCR & extraction" }] },
    { title: "Communication", items: [{ name: "Resend", desc: "Transactional email" }] },
    { title: "Image Generation", items: [{ name: "Replicate", desc: "AI architectural renders" }] },
    { title: "Observability", items: [{ name: "Sentry", desc: "Error tracking" }, { name: "PostHog", desc: "Product analytics" }] },
    { title: "Storage", items: [{ name: "Object Storage", desc: "File & asset storage" }, { name: "Upstash Redis", desc: "Cache & sessions" }, { name: "PostgreSQL", desc: "Primary database" }] },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {categories.map(cat => (
        <FlowSection key={cat.title} title={cat.title}>
          <div className="space-y-2">
            {cat.items.map(item => (
              <div key={item.name} className="text-xs">
                <span className="font-semibold text-foreground">{item.name}</span>
                <span className="text-muted-foreground ml-1">— {item.desc}</span>
              </div>
            ))}
          </div>
        </FlowSection>
      ))}
    </div>
  );
}

function L2Financial() {
  const waterfall: { label: string; sublabel: string; color: FlowNode["color"]; result?: string; resultColor?: FlowNode["color"] }[] = [
    { label: "Room Revenue", sublabel: "ADR × Occ × Rooms × Days", color: "purple" },
    { label: "F&B Revenue", sublabel: "RevPAR × F&B Capture %", color: "purple" },
    { label: "Events Revenue", sublabel: "Event Pace × Avg Check", color: "purple" },
    { label: "Other Income", sublabel: "Parking, Spa, Retail, Misc", color: "purple" },
  ];
  const deductions: { from: string; less: string; sublabel: string; result: string; resultColor: FlowNode["color"] }[] = [
    { from: "Total Revenue", less: "Departmental Expenses", sublabel: "Housekeeping, F&B, Events, Other", result: "GOP", resultColor: "blue" },
    { from: "GOP", less: "Management Fees", sublabel: "Base % + Incentive %", result: "AGOP", resultColor: "blue" },
    { from: "AGOP", less: "Fixed Charges", sublabel: "Insurance + Property Tax", result: "NOI", resultColor: "blue" },
    { from: "NOI", less: "FF&E Reserve", sublabel: "% of Total Revenue", result: "ANOI", resultColor: "blue" },
    { from: "ANOI", less: "Interest Expense", sublabel: "Debt Service", result: "Pre-Tax Income", resultColor: "purple" },
    { from: "Pre-Tax", less: "Income Tax", sublabel: "NOL carryforward applied", result: "Net Income", resultColor: "green" },
  ];
  return (
    <div className="space-y-4">
      <FlowSection title="Revenue Streams">
        <div className="flex flex-wrap gap-2">
          {waterfall.map(w => (
            <NodeBox key={w.label} node={{ id: w.label, label: w.label, sublabel: w.sublabel, color: w.color }} />
          ))}
          <Arrow />
          <NodeBox node={{ id: "total-rev", label: "Total Revenue", color: "purple" }} />
        </div>
      </FlowSection>
      <FlowSection title="USALI Waterfall">
        <div className="space-y-2">
          {deductions.map(d => (
            <div key={d.result} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-20 text-right shrink-0">{d.from}</span>
              <span className="text-xs text-destructive font-medium">−</span>
              <NodeBox node={{ id: d.less, label: d.less, sublabel: d.sublabel, color: "amber" }} />
              <Arrow />
              <NodeBox node={{ id: d.result, label: d.result, color: d.resultColor }} />
            </div>
          ))}
        </div>
      </FlowSection>
    </div>
  );
}

function L2ManCo() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FlowSection title="Revenue">
        <div className="space-y-2">
          <NodeBox node={{ id: "base", label: "Base Management Fees", sublabel: "% of Total Revenue", color: "green" }} />
          <NodeBox node={{ id: "incentive", label: "Incentive Fees", sublabel: "% of GOP", color: "green" }} />
          <NodeBox node={{ id: "svc", label: "Service Fee Categories", sublabel: "Direct vs Centralized", color: "green" }} />
        </div>
      </FlowSection>
      <FlowSection title="Expenses">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Fixed Overhead (escalated by inflation)</p>
            <div className="flex flex-wrap gap-1">
              {["Office Lease", "Professional Services", "Tech Infrastructure"].map(e => (
                <NodeBox key={e} node={{ id: e, label: e, color: "amber" }} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Variable Costs</p>
            <div className="flex flex-wrap gap-1">
              <NodeBox node={{ id: "travel", label: "Travel & IT", sublabel: "per client", color: "amber" }} />
              <NodeBox node={{ id: "mktg", label: "Marketing & Misc", sublabel: "% of revenue", color: "amber" }} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Staffing Tiers</p>
            <div className="flex flex-wrap gap-1">
              {["≤3 props → 2.5 FTE", "≤6 props → 4.5 FTE", "7+ props → 7.0 FTE"].map((t, i) => (
                <NodeBox key={i} node={{ id: `tier${i}`, label: `Tier ${i + 1}`, sublabel: t, color: "blue" }} />
              ))}
            </div>
          </div>
        </div>
      </FlowSection>
      <FlowSection title="Bottom Line" className="md:col-span-2">
        <FlowRow>
          <PipelineStep id="ebitda" label="EBITDA" color="blue" />
          <PipelineStep id="pretax" label="Pre-Tax Income" color="purple" />
          <PipelineStep id="tax" label="Tax Provision" color="amber" />
          <PipelineStep id="net" label="Net Income" color="green" arrow={false} />
        </FlowRow>
      </FlowSection>
    </div>
  );
}

function L2DualEngine() {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <NodeBox node={{ id: "assumptions", label: "Property Assumptions", sublabel: "Revenue, Expenses, Debt, CapEx", color: "purple" }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FlowSection title="Client-Side Engine (Real-Time UI)">
          <FlowCol>
            <DownStep id="c-engine" label="Financial Engine" sublabel="Deterministic calc pipeline" color="blue" />
            <div className="flex gap-2">
              {["Income Stmt", "Cash Flow", "Balance Sheet"].map(s => (
                <NodeBox key={s} node={{ id: `c-${s}`, label: s, color: "blue" }} />
              ))}
            </div>
            <Arrow direction="down" />
            <NodeBox node={{ id: "c-results", label: "Client Results", sublabel: "Displayed in UI", color: "green" }} />
          </FlowCol>
        </FlowSection>
        <FlowSection title="Server-Side Checker (Independent)">
          <FlowCol>
            <DownStep id="s-engine" label="Calculation Checker" sublabel="Isolated recalculation" color="blue" />
            <div className="flex gap-2">
              {["Income Stmt", "Cash Flow", "Balance Sheet"].map(s => (
                <NodeBox key={s} node={{ id: `s-${s}`, label: s, color: "blue" }} />
              ))}
            </div>
            <Arrow direction="down" />
            <NodeBox node={{ id: "s-results", label: "Server Results", sublabel: "Never shown to user", color: "amber" }} />
          </FlowCol>
        </FlowSection>
      </div>
      <div className="flex justify-center gap-3 flex-wrap">
        <NodeBox node={{ id: "unqual", label: "✓ Unqualified", sublabel: "Clean audit", color: "green" }} />
        <NodeBox node={{ id: "qual", label: "⚠ Qualified", sublabel: "Minor issues", color: "amber" }} />
        <NodeBox node={{ id: "adverse", label: "✗ Adverse", sublabel: "Material failures", color: "red" }} />
      </div>
    </div>
  );
}

function L2VerificationTiers() {
  const tiers = [
    { title: "Tier 1 — Property", checks: ["Revenue Formula (ADR × Occ × Rooms)", "Debt Service PMT (ASC 470)", "Depreciation Basis (ASC 360)", "Cash Flow Reconciliation (ASC 230)"], color: "blue" as const },
    { title: "Tier 2 — Company", checks: ["Management Fee Calc (ASC 606)", "ManCo Cash Flow", "SAFE Tranche Validation"], color: "purple" as const },
    { title: "Tier 3 — Consolidated", checks: ["Intercompany Elimination (ASC 810)", "Portfolio Totals", "Balance Sheet Identity (A = L + E)"], color: "green" as const },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tiers.map(tier => (
          <FlowSection key={tier.title} title={tier.title}>
            <div className="space-y-1.5">
              {tier.checks.map(check => (
                <NodeBox key={check} node={{ id: check, label: check, color: tier.color }} />
              ))}
            </div>
          </FlowSection>
        ))}
      </div>
      <FlowSection title="Four-Stage Pipeline">
        <FlowRow>
          <PipelineStep id="s1" label="Formula Checker" color="blue" />
          <PipelineStep id="s2" label="GAAP Compliance" color="blue" />
          <PipelineStep id="s3" label="Full Auditor" color="purple" />
          <PipelineStep id="s4" label="Cross-Calculator" color="green" arrow={false} />
        </FlowRow>
      </FlowSection>
    </div>
  );
}

function L2Auth() {
  return (
    <FlowRow>
      <PipelineStep id="login" label="Login" color="slate" />
      <PipelineStep id="session" label="Session" color="blue" />
      <PipelineStep id="role" label="User Role" color="purple" />
      <PipelineStep id="group" label="User Group" color="blue" />
      <PipelineStep id="branding" label="Branding" color="green" />
      <PipelineStep id="theme" label="Theme" sublabel="user → group → default" color="amber" arrow={false} />
    </FlowRow>
  );
}

function L2AI() {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <NodeBox node={{ id: "rebecca", label: "Rebecca AI Advisor", sublabel: "Chat-based assistant", color: "purple" }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FlowSection title="Client-Side Tools (browser)">
          <div className="space-y-1.5">
            {["navigateToPage", "showPropertyDetails", "openPropertyEditor", "startGuidedTour"].map(t => (
              <NodeBox key={t} node={{ id: t, label: t, color: "blue" }} />
            ))}
          </div>
        </FlowSection>
        <FlowSection title="Server-Side Webhooks (API)">
          <div className="space-y-1.5">
            {["getProperties", "getPropertyDetails", "getPortfolioSummary", "getGlobalAssumptions"].map(t => (
              <NodeBox key={t} node={{ id: t, label: t, color: "green" }} />
            ))}
          </div>
        </FlowSection>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FlowSection title="Knowledge Base (RAG)">
          <div className="space-y-1.5">
            <NodeBox node={{ id: "static", label: "Static KB", sublabel: "Product docs, USALI glossary", color: "green" }} />
            <NodeBox node={{ id: "dynamic", label: "Dynamic Live-Data", sublabel: "Property snapshots synced", color: "green" }} />
          </div>
        </FlowSection>
        <FlowSection title="Integrity Rule">
          <NodeBox node={{ id: "rule", label: "Rebecca NEVER calculates", sublabel: "All numbers from deterministic engine", color: "red" }} />
        </FlowSection>
      </div>
    </div>
  );
}

function L2Research() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-center">
        <NodeBox node={{ id: "prop-trig", label: "Property-Level", sublabel: "Single asset research", color: "blue" }} />
        <NodeBox node={{ id: "comp-trig", label: "Company-Level", sublabel: "ICP-driven portfolio", color: "purple" }} />
      </div>
      <FlowSection title="Context Assembly">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "ICP / Asset Definition", sublabel: "Market, brand tier" },
            { label: "Location Profile", sublabel: "City, submarket, MSA" },
            { label: "Property Profile", sublabel: "Room count, F&B, meetings" },
            { label: "Financial Context", sublabel: "ADR, occupancy, RevPAR" },
          ].map(c => (
            <NodeBox key={c.label} node={{ id: c.label, label: c.label, sublabel: c.sublabel, color: "blue" }} />
          ))}
        </div>
      </FlowSection>
      <FlowSection title="Tool-Augmented LLM">
        <FlowRow>
          <PipelineStep id="web" label="Web Search" sublabel="Live market data" color="purple" />
          <PipelineStep id="adr" label="compute_adr_projection" color="purple" />
          <PipelineStep id="occ" label="compute_occupancy_ramp" color="purple" arrow={false} />
        </FlowRow>
      </FlowSection>
      <FlowSection title="Output → Validation → Storage">
        <FlowRow>
          <PipelineStep id="comp" label="Competitive Landscape" color="green" />
          <PipelineStep id="bench" label="Operating Benchmarks" color="green" />
          <PipelineStep id="econ" label="Local Economics" color="green" />
          <PipelineStep id="extract" label="Value Extractor" color="amber" />
          <PipelineStep id="validate" label="Consistency Checks" color="amber" />
          <PipelineStep id="store" label="market_research" sublabel="PostgreSQL" color="blue" arrow={false} />
        </FlowRow>
      </FlowSection>
      <div className="flex gap-3 justify-center">
        <NodeBox node={{ id: "fresh", label: "🟢 Fresh", sublabel: "< 30 days", color: "green" }} />
        <NodeBox node={{ id: "stale", label: "🔴 Stale", sublabel: "≥ 30 days → re-trigger", color: "red" }} />
      </div>
    </div>
  );
}

function L3Property() {
  const phases: { title: string; items: string[]; color: FlowNode["color"] }[] = [
    { title: "Phase 1 — Acquisition", items: ["Purchase Price + Improvements + Pre-Opening = Total Project Cost", "Capital Structure: Equity + Acquisition Loan (LTV/DSCR)", "Depreciation Basis = Purchase + Improvements − Land Value"], color: "blue" },
    { title: "Phase 2 — Pre-Opening", items: ["Debt Service begins (IO or amortizing)", "Operating Reserve covers shortfall", "Depreciation accrues, NOL builds", "No Revenue yet"], color: "amber" },
    { title: "Phase 3 — Operations", items: ["Occupancy ramp: Start% → Max%", "USALI waterfall: Revenue → GOP → AGOP → NOI → ANOI", "Less: Debt Service → Income Tax (w/ NOL) → FCFE"], color: "green" },
    { title: "Phase 4 — Refinance", items: ["New loan sized by updated NOI · LTV · DSCR", "Payoff acquisition debt", "Net proceeds ± recalculate debt service"], color: "purple" },
    { title: "Phase 5 — Exit", items: ["Exit Valuation = Forward-Year NOI ÷ Cap Rate", "Less: Disposition Commission + Outstanding Debt", "Return Metrics: IRR, MOIC, Cash-on-Cash"], color: "green" },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {phases.map((p, i) => (
        <FlowSection key={p.title} title={p.title}>
          <div className="space-y-1.5">
            {p.items.map(item => (
              <p key={item} className="text-[11px] text-foreground leading-tight">{item}</p>
            ))}
          </div>
          {i < phases.length - 1 && <div className="hidden md:block text-center mt-2 text-muted-foreground text-xs">→</div>}
        </FlowSection>
      ))}
    </div>
  );
}

function L3DataModel() {
  const entities: { name: string; fields: string[]; relations: string[] }[] = [
    { name: "Users", fields: ["id, username, role, companyId, userGroupId"], relations: ["→ Properties, Scenarios, Sessions, LoginLogs, ActivityLogs, Conversations, MarketResearch, ProspectiveProperties, VerificationRuns, AlertRules, GlobalAssumptions"] },
    { name: "Properties", fields: ["id, name, userId, status, financialData"], relations: ["→ PropertyPhotos, PropertyFeeCategories, MarketResearch, UserGroupProperties"] },
    { name: "UserGroups", fields: ["id, name, logoId, themeId"], relations: ["→ UserGroupProperties, Logos, DesignThemes"] },
    { name: "Scenarios", fields: ["id, userId, name, snapshot"], relations: ["← Users"] },
    { name: "Conversations", fields: ["id, userId, title"], relations: ["→ Messages"] },
    { name: "AlertRules", fields: ["id, userId, ruleType, enabled"], relations: ["→ NotificationLogs"] },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {entities.map(e => (
        <FlowSection key={e.name} title={e.name}>
          <p className="text-[10px] text-muted-foreground font-mono mb-1">{e.fields[0]}</p>
          <p className="text-[10px] text-foreground">{e.relations[0]}</p>
        </FlowSection>
      ))}
    </div>
  );
}

function L3Export() {
  const formats = [
    { label: "PDF", sublabel: "jsPDF + Premium Puppeteer", color: "blue" as const },
    { label: "Excel", sublabel: "xlsx", color: "green" as const },
    { label: "CSV", sublabel: "csv-stringify", color: "green" as const },
    { label: "PowerPoint", sublabel: "pptxgenjs", color: "purple" as const },
    { label: "Chart PNG", sublabel: "dom-to-image", color: "amber" as const },
    { label: "Table PNG", sublabel: "dom-to-image", color: "amber" as const },
  ];
  return (
    <FlowRow>
      <NodeBox node={{ id: "data", label: "Financial Data", color: "slate" }} />
      <Arrow />
      <div className="flex flex-wrap gap-2">
        {formats.map(f => (
          <NodeBox key={f.label} node={{ id: f.label, label: f.label, sublabel: f.sublabel, color: f.color }} />
        ))}
      </div>
    </FlowRow>
  );
}

function L3RoleAccess() {
  const roles: { role: string; color: FlowNode["color"]; access: string[] }[] = [
    { role: "Admin", color: "red", access: ["Admin Panel", "Company Assumptions", "All Shared Pages", "All Analysis", "Verification"] },
    { role: "User", color: "blue", access: ["Shared Pages", "Analysis Pages"] },
    { role: "Checker", color: "purple", access: ["Shared Pages", "Analysis Pages", "Verification"] },
    { role: "Investor", color: "slate", access: ["Dashboard", "Properties", "Profile", "Help"] },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {roles.map(r => (
        <FlowSection key={r.role} title={r.role}>
          <div className="space-y-1">
            {r.access.map(a => (
              <NodeBox key={a} node={{ id: `${r.role}-${a}`, label: a, color: r.color }} />
            ))}
          </div>
        </FlowSection>
      ))}
    </div>
  );
}

export default function DiagramsTab() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="1">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="1">Level 1 — Overview</TabsTrigger>
          <TabsTrigger value="2">Level 2 — Domains</TabsTrigger>
          <TabsTrigger value="3">Level 3 — Details</TabsTrigger>
        </TabsList>

        <TabsContent value="1" className="space-y-6 mt-4">
          <DiagramCard title="Application Flow" description="High-level user journey from login to exports">
            <L1AppFlow />
          </DiagramCard>
          <DiagramCard title="Two-Entity Model" description="Property SPVs, Management Company, and Consolidated view with intercompany elimination">
            <L1TwoEntity />
          </DiagramCard>
          <DiagramCard title="Integration & Infrastructure Map" description="All external services organized by category with data flow directions">
            <L1Integrations />
          </DiagramCard>
        </TabsContent>

        <TabsContent value="2" className="mt-4">
          <Accordion type="multiple" defaultValue={["financial", "manco", "dual-engine", "verification", "auth", "ai", "research"]}>
            <AccordionItem value="financial">
              <AccordionTrigger className="text-sm font-semibold">Financial Calculation Pipeline</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="USALI Income Waterfall" description="Revenue → GOP → AGOP → NOI → ANOI → Net Income">
                  <L2Financial />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="manco">
              <AccordionTrigger className="text-sm font-semibold">Management Company Engine</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="ManCo Financial Model" description="Revenue (Base + Incentive + Service Fees) → Expenses → Capital Raise → Bottom Line">
                  <L2ManCo />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="dual-engine">
              <AccordionTrigger className="text-sm font-semibold">Dual-Engine Verification Architecture</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Client Engine vs Server Checker" description="Both engines run in parallel, then cross-validated for audit opinion">
                  <L2DualEngine />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="verification">
              <AccordionTrigger className="text-sm font-semibold">Three-Tier Verification Pipeline</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Verification Tiers & GAAP Compliance" description="Property → Company → Consolidated with ASC references">
                  <L2VerificationTiers />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="auth">
              <AccordionTrigger className="text-sm font-semibold">Auth & Theme Resolution</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Authentication & Branding" description="Login → Role → Group → Theme cascade">
                  <L2Auth />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="ai">
              <AccordionTrigger className="text-sm font-semibold">Rebecca AI Advisor Architecture</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Rebecca Chat Tool System" description="Server tools + RAG knowledge base">
                  <L2AI />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="research">
              <AccordionTrigger className="text-sm font-semibold">Market Research Pipeline</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="ICP-Driven Research & Value Extraction" description="Trigger → Context → LLM → Output → Validation → Storage → UI">
                  <L2Research />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        <TabsContent value="3" className="mt-4">
          <Accordion type="multiple" defaultValue={["property", "data-model", "export", "role-access"]}>
            <AccordionItem value="property">
              <AccordionTrigger className="text-sm font-semibold">Property Lifecycle</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Investment Lifecycle & Cash Flow Engine" description="Acquisition → Pre-Opening → Operations → Refinance → Exit">
                  <L3Property />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="data-model">
              <AccordionTrigger className="text-sm font-semibold">Data Model ER Diagram</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Entity Relationships" description="Core data entities and their relationships">
                  <L3DataModel />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="export">
              <AccordionTrigger className="text-sm font-semibold">Export Pipeline</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Six-Format Export Suite" description="PDF, Excel, CSV, PowerPoint, Chart PNG, Table PNG">
                  <L3Export />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="role-access">
              <AccordionTrigger className="text-sm font-semibold">Role-Based Access Control</AccordionTrigger>
              <AccordionContent>
                <DiagramCard title="Role-Based Access Control" description="Four user roles, sidebar visibility, permission gates">
                  <L3RoleAccess />
                </DiagramCard>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>
    </div>
  );
}
