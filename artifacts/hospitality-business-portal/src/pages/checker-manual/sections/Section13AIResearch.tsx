import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { Callout } from "@/components/ui/callout";
import { IconResearch } from "@/components/icons";

interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section13AIResearch({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="ai-research"
      title="13. AI Research & Calibration"
      icon={IconResearch}
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-muted-foreground text-sm">AI-powered market research uses Norfolk AI to analyze markets and provide assumption calibration guidance. Research is available at the property level and globally.</p>
      <ManualTable
        headers={["Research Area", "What It Produces", "Badge Fields Affected"]}
        rows={[
          ["ADR Analysis", "Market ADR benchmarks, competitive set comparison, growth trends", "Starting ADR, ADR Annual Growth (3–5%)"],
          ["Occupancy Analysis", "Seasonal patterns, market penetration rates, ramp-up timelines", "Starting Occupancy, Occupancy Growth Step (4–6%)"],
          ["Cap Rate Analysis", "Market cap rates by location and property type", "Exit Cap Rate"],
          ["Revenue Mix", "F&B, events, and other revenue benchmarks for the market", "Events Share (15–20%), F&B Share (25–35%), Other Share (2–5%)"],
          ["Disposition", "Sale commission norms by market", "Sale Commission (4–6%)"],
        ]}
      />
      <p className="text-muted-foreground text-sm mt-2">When research is available, benchmark range labels appear next to assumption fields showing the AI-recommended market range. Hover to see the data source and date. Click any benchmark label to auto-fill the recommended value.</p>

      <h3 className="text-foreground text-sm font-semibold mt-6 mb-2">Intelligence Verification</h3>
      <p className="text-muted-foreground text-sm mb-2">Checkers should validate AI research recommendations against known industry data sources before approving assumption changes. Use the following cross-reference workflow:</p>

      <ManualTable
        headers={["Step", "Action", "Reference Source"]}
        rows={[
          ["1", "Open the Guidance Side Sheet for the assumption being reviewed", "Click the arrow icon next to any research badge"],
          ["2", "Check the confidence indicator (High/Medium/Low) and relaxation level", "Range tab in the Guidance Sheet (confidence + relaxation badge)"],
          ["3", "Verify the P25/P50/P75 range against published industry benchmarks", "STR/CoStar Annual Report, CBRE Cap Rate Survey, USALI 12th Edition"],
          ["4", "Compare peer properties in the Peers tab against known comp sets", "STR STAR reports, local market surveys"],
          ["5", "Review the source attribution and methodology description", "Range tab — source name, date, and reasoning"],
          ["6", "Confirm freshness — stale research (amber indicator) should be refreshed before use; missing (red) means research has not been run", "Intelligence Status Bar or freshness badge"],
        ]}
      />

      <h4 className="text-foreground text-xs font-semibold mt-3 mb-2">Key Verification Benchmarks by Chain Scale</h4>
      <ManualTable
        headers={["Chain Scale", "ADR Range", "Stabilized Occ.", "Base Mgmt Fee", "Source"]}
        rows={[
          ["Luxury", "$396+", "65–75%", "3–4%", "STR/CoStar 2024"],
          ["Upper Upscale", "$173–$312", "70–80%", "3–5%", "STR/CoStar 2024"],
          ["Upscale", "$134–$198", "72–82%", "4–6%", "STR/CoStar 2024"],
          ["Upper Midscale", "$100–$140", "60–72%", "5–8%", "STR/CoStar 2024"],
          ["VRBO/STR", "Market-dependent", "55–75%", "20–35% (all-in)", "AirDNA/VRBO 2024"],
        ]}
      />

      <Callout>When a research recommendation falls outside published benchmark ranges for the property's chain scale, flag it for admin review. The Guidance Sheet's reasoning field should explain any deviation.</Callout>
    </SectionCard>
  );
}
