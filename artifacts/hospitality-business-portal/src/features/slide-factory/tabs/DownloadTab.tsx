import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconDownload } from "@/components/icons";
import { IconCheckCircle } from "@/components/icons/status-icons";
import type { SlideFactoryRun } from "../SlideFactoryTypes";
import { FactoryOverridePanel } from "./AgentsOverridePanel";
import { FactoryErrorPill } from "./FactoryErrorPill";
import { FactoryProgressPill } from "./FactoryProgressPill";

// ── Tab 6 — Download (complete) ──────────────────────────────────────────────

export function FactoryDownloadTab({ run, onRunUpdate }: { run: SlideFactoryRun; onRunUpdate: (r: SlideFactoryRun) => void }) {
  const { toast } = useToast();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasDeck = Boolean(run.deckR2Key);
  const hasPptx = Boolean(run.pptxR2Key);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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

  return (
    <div className="space-y-4" data-testid={`download-tab-${run.id}`}>
      {/* Borderless success section */}
      <div className="space-y-3">
        {/* Inline success row */}
        <div className="flex items-center gap-2">
          <IconCheckCircle weight="fill" className="w-4 h-4 text-success shrink-0" />
          <div>
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

      <FactoryOverridePanel run={run} onRunUpdate={onRunUpdate} />
    </div>
  );
}
