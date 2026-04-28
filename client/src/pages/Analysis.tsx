import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { IconCalculator, IconCompare, IconTimeline, IconSliders, IconWallet, IconBuilding } from "@/components/icons";
import type { ComponentType } from "react";
import type { IconProps } from "@/components/icons/icon-utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnimatePresence, motion } from "framer-motion";
import SensitivityAnalysis from "./SensitivityAnalysis";
import FinancingAnalysis from "./FinancingAnalysis";
import ComparisonView from "./ComparisonView";
import TimelineView from "./TimelineView";
import FundingPredictor from "./FundingPredictor";

type AnalysisTab = "sensitivity" | "compare" | "structures" | "timeline" | "financing" | "capital-raise";

export default function Analysis() {
  const [tab, setTab] = useState<AnalysisTab>("sensitivity");

  const tabs: { id: AnalysisTab; label: string; icon: ComponentType<IconProps> }[] = [
    { id: "sensitivity", label: "Sensitivity", icon: IconSliders },
    { id: "compare", label: "Compare", icon: IconCompare },
    { id: "structures", label: "Structures", icon: IconBuilding },
    { id: "timeline", label: "Timeline", icon: IconTimeline },
    { id: "financing", label: "Financing", icon: IconCalculator },
    { id: "capital-raise", label: "Capital Raise", icon: IconWallet },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Simulation and Analysis"
          subtitle="Advanced modeling tools for sensitivity testing, property comparison, investment timelines, debt sizing, and capital raise analysis."
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as AnalysisTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:w-max">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="flex items-center gap-2"
                  data-testid={`tab-trigger-${t.id}`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TabsContent value="sensitivity" className="mt-0 border-none p-0">
                  <SensitivityAnalysis embedded />
                </TabsContent>
                <TabsContent value="compare" className="mt-0 border-none p-0">
                  <ComparisonView embedded />
                </TabsContent>
                <TabsContent value="structures" className="mt-0 border-none p-0">
                  <div className="rounded-lg border border-border/60 bg-card p-6 text-center space-y-4" data-testid="panel-structures-launcher">
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
                </TabsContent>
                <TabsContent value="timeline" className="mt-0 border-none p-0">
                  <TimelineView embedded />
                </TabsContent>
                <TabsContent value="financing" className="mt-0 border-none p-0">
                  <FinancingAnalysis embedded />
                </TabsContent>
                <TabsContent value="capital-raise" className="mt-0 border-none p-0">
                  <FundingPredictor embedded />
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}
