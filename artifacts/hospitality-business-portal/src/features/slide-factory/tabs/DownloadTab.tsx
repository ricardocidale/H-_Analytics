import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconDownload } from "@/components/icons";
import { IconCheckCircle } from "@/components/icons/status-icons";
import type { SlideFactoryRun, VerificationFinding } from "../SlideFactoryTypes";
import { FactoryOverridePanel } from "./AgentsOverridePanel";
import { FactoryErrorPill } from "./FactoryErrorPill";
import { FactoryProgressPill } from "./FactoryProgressPill";

// ── Tab 6 — Download (complete) ──────────────────────────────────────────────

const SEVERITY_DOT: Record<VerificationFinding["severity"], string> = {
  ok: "bg-emerald-500",
  advisory: "bg-sky-500",
  warning: "bg-amber-500",
  block: "bg-red-500",
};

const CATEGORY_LABEL: Record<VerificationFinding["category"], string> = {
  text_cutoff: "Text cut-off",
  placeholder: "Placeholder",
  readability: "Readability",
  layout: "Layout",
  consistency: "Consistency",
  data_quality: "Data quality",
};

function verdictFromStatus(status: SlideFactoryRun["verificationStatus"]): string {
  if (status === "passed") return "All checks passed";
  if (status === "failed") return "Issues found — review below";
  if (status === "error") return "Verification error";
  if (status === "running") return "Verification in progress…";
  return "";
}

export function FactoryDownloadTab({ run, onRunUpdate }: { run: SlideFactoryRun; onRunUpdate: (r: SlideFactoryRun) => void }) {
  const { toast } = useToast();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [overallVerdict, setOverallVerdict] = useState<string | null>(null);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasDeck = Boolean(run.deckR2Key);
  const hasPptx = Boolean(run.pptxR2Key);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-open findings panel when prior results already exist on the run
  useEffect(() => {
    if (run.verificationStatus != null && run.verificationLog != null) {
      setFindingsOpen(true);
    }
  }, [run.verificationStatus, run.verificationLog]);

  const handleDownload = async (format: "pdf" | "pptx") => {
    setDownloadingPdf(false);
    setDownloadingPptx(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const setLoading = format === "pdf" ? setDownloadingPdf : setDownloadingPptx;
    setLoading(true);
    const url =
      format === "pdf"
        ? `/api/lb-slides/factory/runs/${run.id}/download`
        : `/api/lb-slides/factory/runs/${run.id}/download/pptx`;
    try {
      const r = await fetch(url, { credentials: "include", signal: controller.signal });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Download failed");
      }
      const blob = await r.blob();
      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `slide-deck-run-${run.id}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // a.click() is synchronous; the browser has already grabbed the URL by
      // this line, so revoke immediately rather than via setTimeout.
      URL.revokeObjectURL(objectUrl);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Download failed";
      toast({ title: "Download failed", description: msg, variant: "destructive" });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const r = await fetch(`/api/slide-factory-runs/${run.id}/verify`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Verification failed");
      }
      const data = (await r.json()) as {
        verificationStatus?: SlideFactoryRun["verificationStatus"];
        verificationLog?: VerificationFinding[];
        overallVerdict?: string;
      };
      onRunUpdate({
        ...run,
        verificationStatus: data.verificationStatus ?? null,
        verificationLog: data.verificationLog ?? null,
      });
      if (data.overallVerdict) setOverallVerdict(data.overallVerdict);
      setFindingsOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      toast({ title: "Verification failed", description: msg, variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  // Error state — floating error pill
  if (run.status === "error") {
    return (
      <FactoryErrorPill message="Build failed — review the Agents tab for details" />
    );
  }

  // Rebuilding state — skeleton shimmer + floating progress pill
  if (run.status === "rebuilding") {
    return (
      <>
        <div className="space-y-2">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-36 rounded-md" />
        </div>
        <FactoryProgressPill label="Rebuilding PDF…" />
      </>
    );
  }

  const findings = run.verificationLog as VerificationFinding[] | null;
  const displayVerdict = overallVerdict ?? (run.verificationStatus ? verdictFromStatus(run.verificationStatus) : null);

  return (
    <div className="space-y-4" data-testid={`download-tab-${run.id}`}>
      {/* Borderless success section */}
      <div className="space-y-3">
        {/* Inline success row */}
        <div className="flex items-center gap-2">
          <IconCheckCircle weight="fill" className="w-4 h-4 text-success shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Deck ready</p>
            {run.completedAt && (
              <p className="text-xs text-muted-foreground">
                Completed {new Date(run.completedAt).toLocaleDateString()} at{" "}
                {new Date(run.completedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Download buttons or deck-missing floating pill */}
        {hasDeck || hasPptx ? (
          <div className="flex flex-wrap gap-2">
            {hasDeck && (
              <Button
                onClick={() => void handleDownload("pdf")}
                disabled={downloadingPdf}
                data-testid="download-pdf-button"
              >
                {downloadingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <IconDownload className="w-4 h-4 mr-2" />
                )}
                Download PDF
              </Button>
            )}
            {hasPptx && (
              <Button
                variant="outline"
                onClick={() => void handleDownload("pptx")}
                disabled={downloadingPptx}
                data-testid="download-pptx-button"
              >
                {downloadingPptx ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <IconDownload className="w-4 h-4 mr-2" />
                )}
                Download PPTX
              </Button>
            )}
          </div>
        ) : (
          <FactoryErrorPill message="Deck not yet rendered · Contact your administrator" />
        )}
      </div>

      {/* Verify deck quality — only shown when a PPTX exists */}
      {hasPptx && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleVerify()}
              disabled={isVerifying}
              data-testid="button-verify-deck"
            >
              {isVerifying && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              {isVerifying ? "Verifying…" : "Verify deck quality"}
            </Button>
            {displayVerdict && !isVerifying && (
              <span
                className={`text-xs font-medium ${
                  run.verificationStatus === "passed"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : run.verificationStatus === "failed"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                }`}
              >
                {displayVerdict}
              </span>
            )}
          </div>

          {/* Findings list — collapsible */}
          {findings && findings.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setFindingsOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-toggle-findings"
              >
                <span>{findingsOpen ? "▾" : "▸"}</span>
                {findings.length} finding{findings.length !== 1 ? "s" : ""}
              </button>
              {findingsOpen && (
                <div className="rounded-md border border-border divide-y divide-border">
                  {findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2.5">
                      <div
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[f.severity]}`}
                        title={f.severity}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium text-foreground shrink-0">
                            Slide {f.slideNumber}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {CATEGORY_LABEL[f.category] ?? f.category}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed">
                          {f.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No-issues success note */}
          {findings && findings.length === 0 && run.verificationStatus === "passed" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              No issues detected across all slides.
            </p>
          )}
        </div>
      )}

      <FactoryOverridePanel run={run} onRunUpdate={onRunUpdate} />
    </div>
  );
}
