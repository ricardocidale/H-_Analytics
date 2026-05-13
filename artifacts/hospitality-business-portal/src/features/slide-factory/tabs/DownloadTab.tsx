import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconDownload } from "@/components/icons";
import { IconCheckCircle, IconAlertCircle } from "@/components/icons/status-icons";
import type { SlideFactoryRun } from "../SlideFactoryTypes";
import { FactoryOverridePanel } from "./AgentsOverridePanel";

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

  if (run.status === "error") {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <IconAlertCircle weight="fill" className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Build failed</p>
              <p className="text-xs text-muted-foreground mt-1">
                One or more slides were rejected. Review the Agents tab for details.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid={`download-tab-${run.id}`}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {run.status === "rebuilding" ? (
              <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
            ) : (
              <IconCheckCircle weight="fill" className="w-4 h-4 text-success" />
            )}
            <CardTitle className="text-sm font-semibold">
              {run.status === "rebuilding" ? "Rebuilding PDF…" : "Deck ready"}
            </CardTitle>
          </div>
          {run.completedAt && run.status !== "rebuilding" && (
            <p className="text-xs text-muted-foreground">
              Completed {new Date(run.completedAt).toLocaleDateString()} at{" "}
              {new Date(run.completedAt).toLocaleTimeString()}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {run.status === "rebuilding" ? (
            <p className="text-xs text-muted-foreground">
              A new version of the deck is being generated…
            </p>
          ) : hasDeck || hasPptx ? (
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
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4">
              <IconAlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Deck not yet rendered</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The build completed but no output files were generated. Please contact your
                  administrator.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FactoryOverridePanel run={run} onRunUpdate={onRunUpdate} />
    </div>
  );
}
