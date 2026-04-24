/**
 * CompanyAnalystOverlay — Renders the streaming research theater and the
 * deterministic Analyst watchdog dialog. Pure presentational composition;
 * extracted from `client/src/pages/CompanyAssumptions.tsx` (task #471).
 */
import { ResearchTheater, type ResearchJob } from "@/components/research/ResearchTheater";
import { AnalystCheckDialog } from "@/components/intelligence/AnalystCheckDialog";
import type { AnalystVerdict, VerdictAction } from "../../../../engine/analyst/contracts/verdict";
import {
  TAB_LABELS,
  type TabKey,
} from "@/hooks/useCompanyAssumptionsForm";

interface Props {
  isGenerating: boolean;
  streamedContent: string;
  abortResearch: () => void;

  watchdogOpen: boolean;
  watchdogResult: AnalystVerdict | null;
  watchdogTab: TabKey | null;
  onWatchdogAction: (action: VerdictAction) => void;
  onProceedAnyway: () => void;
  onWatchdogOpenChange: (open: boolean) => void;
}

export function CompanyAnalystOverlay(props: Props) {
  const {
    isGenerating, streamedContent, abortResearch,
    watchdogOpen, watchdogResult, watchdogTab,
    onWatchdogAction, onProceedAnyway, onWatchdogOpenChange,
  } = props;

  const researchJobs: ResearchJob[] = isGenerating
    ? [
        { id: "company-context", label: "Analyzing company context", group: "Preparation",
          status: streamedContent.length > 0 ? "complete" : "generating" },
        { id: "icp-profile", label: "Processing ICP profile", group: "Preparation",
          status: streamedContent.length > 100 ? "complete" : streamedContent.length > 0 ? "generating" : "pending" },
        { id: "fee-benchmarks", label: "Benchmarking fee structures", group: "Research",
          status: streamedContent.length > 500 ? "complete" : streamedContent.length > 100 ? "generating" : "pending" },
        { id: "compensation", label: "Analyzing compensation data", group: "Research",
          status: streamedContent.length > 1000 ? "complete" : streamedContent.length > 500 ? "generating" : "pending" },
        { id: "operating-ratios", label: "Calculating operating ratios", group: "Research",
          status: streamedContent.length > 1500 ? "complete" : streamedContent.length > 1000 ? "generating" : "pending" },
        { id: "synthesis", label: "Synthesizing findings", group: "Finalization",
          status: streamedContent.length > 2000 ? "generating" : "pending" },
      ]
    : [];

  return (
    <>
      <ResearchTheater
        jobs={researchJobs}
        streamingText={streamedContent}
        isVisible={isGenerating}
        onCancel={abortResearch}
      />
      <AnalystCheckDialog
        open={watchdogOpen}
        verdict={watchdogResult}
        tabLabel={watchdogTab ? TAB_LABELS[watchdogTab] : undefined}
        onAction={onWatchdogAction}
        onProceedAnyway={onProceedAnyway}
        onOpenChange={onWatchdogOpenChange}
      />
    </>
  );
}
