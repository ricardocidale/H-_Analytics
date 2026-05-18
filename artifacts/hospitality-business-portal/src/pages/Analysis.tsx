import { Link } from "wouter";
import Layout from "@/components/Layout";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  IconCalculator,
  IconCompare,
  IconTimeline,
  IconSliders,
  IconWallet,
  IconBuilding,
} from "@/components/icons";
import SensitivityAnalysis from "./analysis/SensitivityAnalysis";
import FinancingAnalysis from "./analysis/FinancingAnalysis";
import ComparisonView from "./analysis/ComparisonView";
import TimelineView from "./analysis/TimelineView";
import FundingPredictor from "./analysis/FundingPredictor";

export default function Analysis() {
  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Simulation and Analysis"
          subtitle="Advanced modeling tools for sensitivity testing, property comparison, investment timelines, debt sizing, and capital raise analysis."
        />

        <CollapsibleSection
          lazyMount
          defaultOpenId="sensitivity"
          items={[
            {
              id: "sensitivity",
              summary: (
                <span className="flex items-center gap-2">
                  <IconSliders className="w-4 h-4 shrink-0" />
                  Sensitivity
                </span>
              ),
              expandedContent: <SensitivityAnalysis embedded />,
            },
            {
              id: "compare",
              summary: (
                <span className="flex items-center gap-2">
                  <IconCompare className="w-4 h-4 shrink-0" />
                  Compare
                </span>
              ),
              expandedContent: <ComparisonView embedded />,
            },
            {
              id: "structures",
              summary: (
                <span className="flex items-center gap-2">
                  <IconBuilding className="w-4 h-4 shrink-0" />
                  Structures
                </span>
              ),
              expandedContent: (
                <div
                  className="rounded-lg border border-border/60 bg-card p-6 text-center space-y-4"
                  data-testid="panel-structures-launcher"
                >
                  <div className="flex justify-center">
                    <IconBuilding className="w-10 h-10 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Operating-Structure Comparison</h3>
                    <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                      Compare own vs. lease vs. HMA vs. franchise side-by-side for any property.
                      See how each structure changes IRR, NOI, equity multiple, and downside risk —
                      and get a recommendation on the best risk-adjusted fit.
                    </p>
                  </div>
                  <Link href="/structures">
                    <Button data-testid="button-open-structures">Open Comparison</Button>
                  </Link>
                </div>
              ),
            },
            {
              id: "timeline",
              summary: (
                <span className="flex items-center gap-2">
                  <IconTimeline className="w-4 h-4 shrink-0" />
                  Timeline
                </span>
              ),
              expandedContent: <TimelineView embedded />,
            },
            {
              id: "financing",
              summary: (
                <span className="flex items-center gap-2">
                  <IconCalculator className="w-4 h-4 shrink-0" />
                  Financing
                </span>
              ),
              expandedContent: <FinancingAnalysis embedded />,
            },
            {
              id: "capital-raise",
              summary: (
                <span className="flex items-center gap-2">
                  <IconWallet className="w-4 h-4 shrink-0" />
                  Capital Raise
                </span>
              ),
              expandedContent: <FundingPredictor embedded />,
            },
          ]}
        />
      </div>
    </Layout>
  );
}
