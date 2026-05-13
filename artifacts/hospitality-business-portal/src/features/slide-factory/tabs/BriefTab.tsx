import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconUpload } from "@/components/icons";
import {
  ACCEPTED_FILE_ACCEPT,
  UPLOAD_IDLE,
} from "../SlideFactoryConstants";
import { isTerminal, isValidBriefFile } from "../SlideFactoryUtils";
import type { SlideFactoryRun, UploadState } from "../SlideFactoryTypes";

// ── Tab 1 — Brief ───────────────────────────────────────────────────────────

export function FactoryBriefTab({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun | null;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadState>(UPLOAD_IDLE);
  const [isAccepting, setIsAccepting] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/lb-slides/factory/runs");
      return r.json() as Promise<SlideFactoryRun>;
    },
    onSuccess: (newRun) => {
      onRunUpdate(newRun);
      toast({ title: "New run started" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start run", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isValidBriefFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Only PDF and PPTX files are accepted.",
        variant: "destructive",
      });
      return;
    }
    setUpload({ stage: "idle", file, error: null });
  };

  const handleUpload = async () => {
    if (!upload.file || !run) return;
    setUpload((prev) => ({ ...prev, stage: "uploading", error: null }));
    try {
      const urlRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: upload.file.name,
        size: upload.file.size,
        contentType: upload.file.type || "application/octet-stream",
        entityType: "slide_factory_brief",
      });
      const { uploadURL, objectPath } = (await urlRes.json()) as {
        uploadURL: string;
        objectPath: string;
      };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: upload.file,
        headers: { "Content-Type": upload.file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Failed to upload file to storage");

      const briefRes = await apiRequest(
        "POST",
        `/api/lb-slides/factory/runs/${run.id}/brief`,
        { r2Key: objectPath, filename: upload.file.name },
      );
      const updated = (await briefRes.json()) as SlideFactoryRun;
      setUpload((prev) => ({ ...prev, stage: "done" }));
      onRunUpdate(updated);
      toast({ title: "Brief uploaded", description: upload.file.name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUpload((prev) => ({ ...prev, stage: "error", error: msg }));
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    }
  };

  const handleAccept = async () => {
    if (!run) return;
    setIsAccepting(true);
    try {
      const r = await apiRequest("POST", `/api/lb-slides/factory/runs/${run.id}/accept-brief`);
      const updated = (await r.json()) as SlideFactoryRun;
      onRunUpdate(updated);
      toast({ title: "Brief accepted" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Accept failed";
      toast({ title: "Failed to accept brief", description: msg, variant: "destructive" });
    } finally {
      setIsAccepting(false);
    }
  };

  // No active run (or previous run ended) — show start CTA
  if (!run || isTerminal(run)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start Factory Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No active factory run. Create one to begin the pipeline.
          </p>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            )}
            Start new run
          </Button>
        </CardContent>
      </Card>
    );
  }

  // status === "new" — upload + accept flow
  const briefOnServer = Boolean(run.briefR2Key);
  const showUploaded = upload.stage === "done" || briefOnServer;
  const displayFilename = upload.file?.name ?? run.briefFilename;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload Brief</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Upload the brief document (PDF or PPTX). After uploading, review it and
          accept to advance the pipeline to Lorenzo ingestion.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />

        {!showUploaded ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 h-auto hover:border-primary/50"
            >
              <IconUpload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {upload.file ? upload.file.name : "Click to select a file"}
              </span>
              <span className="text-xs text-muted-foreground">PDF or PPTX only</span>
            </Button>

            {upload.file && (
              <Button
                onClick={() => void handleUpload()}
                disabled={upload.stage === "uploading"}
                className="w-full sm:w-auto"
              >
                {upload.stage === "uploading" && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                {upload.stage === "uploading" ? "Uploading…" : "Upload brief"}
              </Button>
            )}
            {upload.error && (
              <p className="text-xs text-destructive">{upload.error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <IconUpload className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{displayFilename}</p>
                <p className="text-xs text-muted-foreground">Uploaded</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  setUpload(UPLOAD_IDLE);
                  fileRef.current?.click();
                }}
              >
                Replace
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onClick={() => void handleAccept()}
                disabled={isAccepting}
              >
                {isAccepting && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                Accept brief
              </Button>
              <p className="text-xs text-muted-foreground">
                Advances pipeline to Lorenzo ingestion
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
