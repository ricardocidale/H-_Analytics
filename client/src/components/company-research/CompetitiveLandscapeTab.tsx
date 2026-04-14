/**
 * CompetitiveLandscapeTab.tsx — Competitive landscape for boutique hotel management companies.
 *
 * Shows common competitor categories, differentiation strategies, and positioning.
 * This tab provides static industry knowledge as a baseline; AI research can overlay
 * market-specific competitive intelligence when generated.
 */
import { IconTarget } from "@/components/icons";
import { SectionCard } from "../property-research/SectionCard";
import { companySectionColors } from "./types";

interface CompetitiveLandscapeTabProps {
  content: any;
}

const COMPETITOR_TYPES = [
  {
    type: "Large Branded Management Companies",
    examples: "Marriott, Hilton, IHG, Accor",
    strengths: "Brand recognition, loyalty programs, global distribution",
    weaknesses: "Standardized approach, less flexibility, higher fees (6-10% base)",
    relevance: "Rarely compete for boutique/lifestyle properties; different target owner",
  },
  {
    type: "Independent Hotel Management Companies",
    examples: "Pyramid, Crescent, Interstate, Aimbridge",
    strengths: "Scale advantages, established systems, diversified portfolio",
    weaknesses: "May deprioritize small properties; cookie-cutter approach possible",
    relevance: "Primary competitors for mid-to-large boutique hotels",
  },
  {
    type: "Boutique/Lifestyle Specialists",
    examples: "Lore Group, Proper Hospitality, Life House, Graduate Hotels",
    strengths: "Deep boutique expertise, design-forward, owner alignment",
    weaknesses: "Limited scale, market concentration, higher cost per property",
    relevance: "Direct competitors — compete on experience quality and owner returns",
  },
  {
    type: "Owner-Operators (Self-Managed)",
    examples: "Individual property owners managing their own assets",
    strengths: "Full control, no management fee, local knowledge",
    weaknesses: "Limited systems, no scale benefits, operationally intensive",
    relevance: "Key conversion opportunity — demonstrate value vs. self-management",
  },
];

const DIFFERENTIATION_STRATEGIES = [
  { strategy: "Events & Wellness Programming", description: "Curated retreat and event packages (yoga, wellness, corporate) that drive premium ADR and ancillary revenue." },
  { strategy: "Revenue Management Technology", description: "Proprietary or best-in-class RMS driving 10-15% RevPAR improvement vs. manual pricing." },
  { strategy: "Centralized Services Model", description: "Cost-plus procurement, marketing, and IT at scale — savings passed to owners with transparent markup." },
  { strategy: "Owner Transparency & Reporting", description: "Real-time financial dashboards, monthly narrative reports, and institutional-grade projections." },
  { strategy: "Asset Enhancement", description: "Design and renovation oversight that increases property value, not just operational income." },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CompetitiveLandscapeTab({ content }: CompetitiveLandscapeTabProps) {
  return (
    <div className="space-y-6">
      <SectionCard icon={IconTarget} title="Competitor Landscape" color={companySectionColors.contracts}>
        <p className="text-xs text-muted-foreground mb-4">
          Four categories of competitors in the boutique hotel management space.
        </p>
        <div className="space-y-4">
          {COMPETITOR_TYPES.map((c, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h4 className="text-sm font-medium text-foreground">{c.type}</h4>
                <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 whitespace-nowrap">{c.examples}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-primary/5 rounded-lg p-2 border border-primary/15">
                  <span className="font-medium text-primary">Strengths: </span>
                  <span className="text-foreground">{c.strengths}</span>
                </div>
                <div className="bg-accent-pop/10 rounded-lg p-2 border border-accent-pop/15">
                  <span className="font-medium text-accent-pop">Weaknesses: </span>
                  <span className="text-foreground">{c.weaknesses}</span>
                </div>
                <div className="bg-chart-1/10 rounded-lg p-2 border border-chart-1/15">
                  <span className="font-medium text-chart-1">Relevance: </span>
                  <span className="text-foreground">{c.relevance}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={IconTarget} title="Differentiation Strategies" color={companySectionColors.fees}>
        <p className="text-xs text-muted-foreground mb-4">
          How a boutique management company can stand out in a crowded market.
        </p>
        <div className="space-y-3">
          {DIFFERENTIATION_STRATEGIES.map((d, i) => (
            <div key={i} className="flex items-start gap-3 bg-primary/5 rounded-lg p-3 border border-primary/10">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">{i + 1}</span>
              </div>
              <div>
                <h5 className="text-sm font-medium text-foreground">{d.strategy}</h5>
                <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
