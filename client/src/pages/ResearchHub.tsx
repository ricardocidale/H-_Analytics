/**
 * ResearchHub.tsx — Research Center page for AI-powered market research.
 *
 * Displays the status of all research across the portfolio: per-property,
 * management company, and global industry research. Each card shows whether
 * research is fresh, stale, or missing, with links to view or generate.
 */
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { useResearchStatus } from "@/lib/api/research";
import { useProperties, useGlobalAssumptions } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2, ArrowRight } from "@/components/icons/themed-icons";
import {
  IconFlaskConical, IconBuilding2, IconBriefcase, IconGlobe, IconRefreshCw,
  IconClock, IconAlertCircle, IconBookOpen,
} from "@/components/icons";
import { IndustryResearchTab } from "@/components/IndustryResearchTab";
import MarketRatesTab from "@/components/admin/MarketRatesTab";
import { Link } from "wouter";
import { format } from "date-fns";
import { motion } from "framer-motion";

function StatusBadge({ status }: { status: "fresh" | "stale" | "missing" }) {
  const config = {
    fresh: {
      label: "Fresh",
      className: "bg-primary/10 text-primary border-primary/20",
      icon: Check,
    },
    stale: {
      label: "Stale",
      className: "bg-accent-pop/10 text-accent-pop border-accent-pop/20",
      icon: IconClock,
    },
    missing: {
      label: "Missing",
      className: "bg-muted text-muted-foreground border-border",
      icon: IconAlertCircle,
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.className}`}
    >
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Not generated";
  try {
    return format(new Date(dateStr), "MMM d, yyyy 'at' h:mm a");
  } catch (_error: unknown) {
    // Fallback if date parsing fails
    return "Not generated";
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

export default function ResearchHub() {
  const {
    data: researchStatus,
    isLoading: isResearchLoading,
    isError: isResearchError,
  } = useResearchStatus();
  const { data: properties, isLoading: isPropertiesLoading } = useProperties();
  const { data: globalAssumptions } = useGlobalAssumptions();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [currentGenIndex, setCurrentGenIndex] = useState(0);
  const [totalToGenerate, setTotalToGenerate] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const generateOneResearch = useCallback(async (
    type: "property" | "company" | "global",
    property?: any,
  ): Promise<boolean> => {
    const controller = new AbortController();
    abortRef.current = controller;

    const body: any = {
      type,
      assetDefinition: globalAssumptions?.assetDefinition,
    };

    if (type === "property" && property) {
      body.propertyId = property.id;
      body.propertyContext = {
        name: property.name,
        location: property.location,
        market: property.market,
        roomCount: property.roomCount,
        startAdr: property.startAdr,
        maxOccupancy: property.maxOccupancy,
        type: property.type,
      };
    }

    const response = await fetch("/api/research/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Server returned ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    return true;
  }, [globalAssumptions]);

  const generateAllMissing = useCallback(async () => {
    if (!properties || !researchStatus) return;

    const missingProps = researchStatus.properties.filter(
      (p: any) => p.status === "missing"
    );
    const companyMissing = researchStatus.company?.status === "missing";
    const globalMissing = researchStatus.global?.status === "missing";

    const totalItems = missingProps.length + (companyMissing ? 1 : 0) + (globalMissing ? 1 : 0);
    if (totalItems === 0) return;

    setIsGeneratingAll(true);
    setTotalToGenerate(totalItems);

    let completedCount = 0;
    let currentIdx = 0;
    let failedNames: string[] = [];

    for (let i = 0; i < missingProps.length; i++) {
      currentIdx++;
      setCurrentGenIndex(currentIdx);
      const propStatus = missingProps[i];
      const property = properties.find((p: any) => p.id === propStatus.propertyId);
      if (!property) continue;

      try {
        await generateOneResearch("property", property);
        completedCount++;
        await queryClient.invalidateQueries({ queryKey: ["research", "status"] });
        await queryClient.invalidateQueries({ queryKey: ["research", "property", property.id] });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") break;
        failedNames.push(property.name);
      }
    }

    if (companyMissing) {
      currentIdx++;
      setCurrentGenIndex(currentIdx);
      try {
        await generateOneResearch("company");
        completedCount++;
        await queryClient.invalidateQueries({ queryKey: ["research", "status"] });
        await queryClient.invalidateQueries({ queryKey: ["research", "company"] });
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          failedNames.push("Company");
        }
      }
    }

    if (globalMissing) {
      currentIdx++;
      setCurrentGenIndex(currentIdx);
      try {
        await generateOneResearch("global");
        completedCount++;
        await queryClient.invalidateQueries({ queryKey: ["research", "status"] });
        await queryClient.invalidateQueries({ queryKey: ["research", "global"] });
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          failedNames.push("Global");
        }
      }
    }

    setIsGeneratingAll(false);
    setCurrentGenIndex(0);
    setTotalToGenerate(0);

    if (failedNames.length > 0 && completedCount === 0) {
      toast({
        title: "Research generation failed",
        description: `Could not generate research for: ${failedNames.join(", ")}. Check that the AI service is available.`,
        variant: "destructive",
      });
    } else if (failedNames.length > 0) {
      toast({
        title: "Research partially complete",
        description: `Generated ${completedCount} of ${totalItems}. Failed: ${failedNames.join(", ")}.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Research generation complete",
        description: `All ${completedCount} missing research reports generated.`,
      });
    }
  }, [properties, researchStatus, globalAssumptions, queryClient, toast, generateOneResearch]);

  const isLoading = isResearchLoading || isPropertiesLoading;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (isResearchError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">
            Failed to load research status. Please try refreshing the page.
          </p>
        </div>
      </Layout>
    );
  }

  const propertyStatuses = researchStatus?.properties ?? [];
  const companyStatus = researchStatus?.company ?? { status: "missing" as const, updatedAt: null };
  const globalStatus = researchStatus?.global ?? { status: "missing" as const, updatedAt: null };

  const freshCount = propertyStatuses.filter((p: any) => p.status === "fresh").length;
  const staleCount = propertyStatuses.filter((p: any) => p.status === "stale").length;
  const missingCount = propertyStatuses.filter((p: any) => p.status === "missing").length;
  const totalMissingCount = missingCount
    + (companyStatus.status === "missing" ? 1 : 0)
    + (globalStatus.status === "missing" ? 1 : 0);

  return (
    <Layout>
      <div className="space-y-8">
        <PageHeader
          title="Research Center"
          subtitle="AI-powered market research for your portfolio, management company, and industry"
          variant="dark"
          actions={
            <div className="flex flex-col items-end gap-1">
              <Button
                onClick={generateAllMissing}
                disabled={isGeneratingAll || totalMissingCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300"
              >
                {isGeneratingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <IconRefreshCw className="w-4 h-4" />
                )}
                {isGeneratingAll
                  ? `Generating ${currentGenIndex} of ${totalToGenerate}...`
                  : "Generate Missing Research"}
              </Button>
              {isGeneratingAll && (
                <div className="w-full max-w-[220px]">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${(currentGenIndex / totalToGenerate) * 100}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Portfolio Research Card */}
          <motion.div
            custom={0}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="bg-card border border-border rounded-lg p-5 shadow-sm group hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-chart-1/10 border border-chart-1/20 flex items-center justify-center">
                  <IconBuilding2 className="w-5 h-5 text-chart-1" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">
                    Portfolio Research
                  </h3>
                  <p className="text-xs text-muted-foreground label-text mt-0.5">
                    Per-property market analysis
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fresh</span>
                <span className="font-medium text-primary">{freshCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Stale</span>
                <span className="font-medium text-accent-pop">{staleCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Missing</span>
                <span className="font-medium text-muted-foreground">{missingCount}</span>
              </div>
            </div>

            <a
              href="#property-research"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View Properties
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </motion.div>

          {/* Company Research Card */}
          <motion.div
            custom={1}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="bg-card border border-border rounded-lg p-5 shadow-sm group hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-chart-3/10 border border-chart-3/20 flex items-center justify-center">
                  <IconBriefcase className="w-5 h-5 text-chart-3" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">
                    Company Research
                  </h3>
                  <p className="text-xs text-muted-foreground label-text mt-0.5">
                    Management company analysis
                  </p>
                </div>
              </div>
              <StatusBadge status={companyStatus.status} />
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {companyStatus.updatedAt
                ? `Updated ${formatDate(companyStatus.updatedAt)}`
                : "Not generated"}
            </p>

            <Link
              href="/company/research"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View Research
              <IconBookOpen className="w-3.5 h-3.5" />
            </Link>
          </motion.div>

          {/* Global Research Card */}
          <motion.div
            custom={2}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="bg-card border border-border rounded-lg p-5 shadow-sm group hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <IconGlobe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">
                    Global Research
                  </h3>
                  <p className="text-xs text-muted-foreground label-text mt-0.5">
                    Industry trends & benchmarks
                  </p>
                </div>
              </div>
              <StatusBadge status={globalStatus.status} />
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {globalStatus.updatedAt
                ? `Updated ${formatDate(globalStatus.updatedAt)}`
                : "Not generated"}
            </p>

            <Link
              href="/company/research"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View Research
              <IconBookOpen className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        </div>

        {/* Property Research Grid */}
        <div id="property-research" className="space-y-4">
          <div>
            <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
              <IconFlaskConical className="w-5 h-5 text-primary" />
              Property Research
            </h3>
            <p className="text-sm text-muted-foreground label-text mt-1">
              Market analysis for each property in your portfolio
            </p>
          </div>

          {propertyStatuses.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-card border border-border rounded-lg p-12 shadow-sm flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center mb-4">
                <IconBuilding2 className="w-7 h-7 text-muted-foreground" />
              </div>
              <h4 className="font-display font-semibold text-foreground mb-1">
                No properties in your portfolio yet
              </h4>
              <p className="text-sm text-muted-foreground max-w-sm">
                Add properties to your portfolio to generate AI-powered market research and competitive analysis.
              </p>
              <Link
                href="/portfolio"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Go to Portfolio
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {propertyStatuses.map((prop: any, index: number) => (
                <motion.div
                  key={prop.propertyId}
                  custom={index + 3}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="bg-card border border-border rounded-lg overflow-hidden shadow-sm group hover:shadow-md transition-all duration-300"
                >
                  {/* Property image or fallback */}
                  {prop.imageUrl ? (
                    <div className="h-32 w-full overflow-hidden">
                      <img
                        src={prop.imageUrl}
                        alt={prop.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="h-32 w-full bg-muted flex items-center justify-center">
                      <IconBuilding2 className="w-10 h-10 text-muted-foreground" />
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-display font-semibold text-foreground truncate" title={prop.name}>
                          {prop.name}
                        </h4>
                        <p className="text-xs text-muted-foreground label-text truncate" title={prop.location}>
                          {prop.location}
                        </p>
                      </div>
                      <div className="flex-shrink-0 ml-2">
                        <StatusBadge status={prop.status} />
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mb-3">
                      {prop.updatedAt
                        ? `Updated ${formatDate(prop.updatedAt)}`
                        : "Not generated"}
                    </p>

                    <Link
                      href={`/property/${prop.propertyId}/research`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      View Research
                      <IconBookOpen className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <IndustryResearchTab />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <MarketRatesTab />
        </motion.div>
      </div>
    </Layout>
  );
}
