import { SectionCard } from "@/components/ui/section-card";
import { Callout } from "@/components/ui/callout";
import { ManualTable } from "@/components/ui/manual-table";
import { IconProperties } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section04Properties({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="properties"
      title="4. Properties"
      icon={IconProperties}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The Properties page lists all hotel properties in the portfolio. Each property is modeled as an independent
        Special Purpose Vehicle (SPV) with its own financial statements.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Adding a Property</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Click the <strong>"Add Property"</strong> button on the Properties page.</li>
          <li>Fill in the property details: name, location, room count, purchase price, and operating assumptions.</li>
          <li>Click <strong>"Save"</strong> to create the property. All financial projections are calculated immediately.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Editing a Property</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Click on a property card to open its detail page, then click <strong>"Edit"</strong>.</li>
          <li>Modify any assumptions — ADR, occupancy, expense rates, financing terms, etc.</li>
          <li>When you click <strong>"Save"</strong>, the entire portfolio is recalculated to reflect your changes.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Deleting a Property</h4>
        <p className="text-sm text-muted-foreground">
          On the property edit page, scroll to the bottom and click <strong>"Delete Property"</strong>.
          This permanently removes the property and all its financial data. The portfolio recalculates automatically.
        </p>
      </div>

      <Callout variant="light">
        When editing assumptions, look for blue badges (GAAP/IRS rules) and benchmark range labels (AI-researched market ranges with a light yellow background) next to field labels.
        Hover blue badges to see the accounting standard. Click any benchmark label to auto-fill market-recommended values.
      </Callout>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Business Model — choose the right archetype before entering assumptions</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Each property is routed through one of four business model archetypes. The archetype determines the
          default cost structure (cleaning labor, admin, IT, ops) and the management fee structure (cost-plus
          services vs consolidated all-in fee). Picking the right one matters: a luxury short-term rental run
          through the hotel cost stack will look unprofitable on paper even when it cash-flows fine in reality.
        </p>
        <ManualBusinessModelTable />
        <p className="text-sm text-muted-foreground mt-3">
          <strong>Two short-term rental variants matter</strong>: <code className="bg-muted px-1 rounded">vrbo</code> is
          full-service management (Vacasa / AvantStay-equivalent) where the property pays one consolidated 25% fee
          and the management company handles every operational task. <code className="bg-muted px-1 rounded">vrbo_owner_managed</code> is
          listing-only management (Evolve Core-equivalent) where the owner arranges cleaning and maintenance
          directly with local vendors — much cheaper in markets with low labor costs (Latin America, parts of Asia
          and Eastern Europe), and the management fee drops to 10%. Pick the variant that matches how the property
          actually operates.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Bundling for LP investor presentations</h4>
        <p className="text-sm text-muted-foreground">
          Single-unit short-term rentals often produce IRRs in the teens (12–19%) on their own. That's normal —
          the unit is small, occupancy ceilings are real, and luxury STR ADRs don't scale linearly. When building
          the investor deck, present these properties as part of a regional bundle alongside larger hotel or
          lodge properties in the same geography. The blended IRR of a bundle (weighted by equity invested)
          smooths the standalone variation. A Colombia bundle of a 20-room luxury ranch (40% IRR) plus a
          single-unit luxury duplex (11% IRR), for example, blends to around 31% — solidly LP-credible.
        </p>
      </div>
    </SectionCard>
  );
}

function ManualBusinessModelTable() {
  return (
    <ManualTable
      variant="light"
      headers={["Business Model", "Use For", "Mgmt Fee", "Cost Structure"]}
      rows={[
        [
          "hotel",
          "Multi-room hospitality property with F&B, events, meetings",
          "8.5% base + 12% incentive (on GOP)",
          "Cost-plus services (admin, marketing, IT, property ops billed separately)",
        ],
        [
          "lodge",
          "Whole-property retreat with bundled F&B; rural, no events",
          "18% base + 10% incentive",
          "Higher cleaning + utilities; fewer departments",
        ],
        [
          "vrbo",
          "Short-term rental run by full-service manager (Vacasa, AvantStay-tier). Owner is passive.",
          "25% all-in (no incentive)",
          "Manager handles all ops; property pays consolidated fee + 14% platform commission",
        ],
        [
          "vrbo_owner_managed",
          "Short-term rental with listing-only manager (Evolve Core-tier). Owner arranges cleaning/handyman directly.",
          "10% all-in (no incentive)",
          "Owner-direct cleaning + maintenance (cheaper in low-labor markets); 14% platform commission",
        ],
      ]}
    />
  );
}
