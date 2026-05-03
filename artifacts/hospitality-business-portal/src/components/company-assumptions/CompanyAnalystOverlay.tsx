/**
 * CompanyAnalystOverlay — Renders the streaming research theater for the
 * Company Assumptions page. Pure presentational composition; extracted
 * from `client/src/pages/CompanyAssumptions.tsx` (task #471).
 *
 * Trigger discipline (task #738 / .claude/rules/analyst-trigger-discipline.md):
 * The deterministic `<AnalystCheckDialog />` watchdog used to be mounted
 * here and opened automatically on a Save when the save-tab response
 * carried a non-OK `verdict`. The Analyst now evaluates ONLY on an
 * explicit AnalystButton click, so the save-tab response no longer
 * carries a verdict and the dialog has no live invocation in this
 * overlay. The component itself is preserved (tests + future
 * button-triggered display use case); it is just not mounted from this
 * surface.
 */
import { ResearchTheater, type ResearchJob } from "@/components/research/ResearchTheater";

interface Props {
  isGenerating: boolean;
  streamedContent: string;
  abortResearch: () => void;
}

export function CompanyAnalystOverlay(props: Props) {
  const { isGenerating, streamedContent, abortResearch } = props;

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
    <ResearchTheater
      jobs={researchJobs}
      streamingText={streamedContent}
      isVisible={isGenerating}
      onCancel={abortResearch}
    />
  );
}
