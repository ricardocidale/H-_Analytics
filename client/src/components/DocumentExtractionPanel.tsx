import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { validateImageFile } from "@/hooks/use-upload";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from "@/components/icons/themed-icons";

interface ExtractionField {
  id: number;
  extractionId: number;
  fieldName: string;
  fieldLabel: string;
  extractedValue: string;
  mappedPropertyField: string | null;
  confidence: number;
  confidenceLevel: "high" | "medium" | "low";
  status: string;
  currentValue: string | null;
}

interface DocumentExtraction {
  id: number;
  propertyId: number;
  fileName: string;
  fileContentType: string;
  status: string;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}

function ConfidenceBadge({ level, score }: { level: string; score: number }) {
  const variants: Record<string, { color: string; label: string }> = {
    high: { color: "bg-primary/15 text-primary border-primary/20", label: "High" },
    medium: { color: "bg-accent-pop/15 text-accent-pop border-accent-pop/20", label: "Medium" },
    low: { color: "bg-destructive/15 text-destructive border-destructive/20", label: "Low" },
  };
  const v = variants[level] || variants.low;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${v.color}`}
      data-testid={`badge-confidence-${level}`}
    >
      {v.label} ({(score * 100).toFixed(0)}%)
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "approved":
      return <CheckCircle2 className="w-4 h-4 text-primary" />;
    case "rejected":
      return <XCircle className="w-4 h-4 text-destructive" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function DocumentExtractionPanel({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [activeExtractionId, setActiveExtractionId] = useState<number | null>(null);
  const [expandedHistory, setExpandedHistory] = useState(false);

  const { data: extractions = [] } = useQuery<DocumentExtraction[]>({
    queryKey: [`/api/documents/extractions/${propertyId}`],
  });

  const { data: fields = [] } = useQuery<ExtractionField[]>({
    queryKey: [`/api/documents/extractions/${activeExtractionId}/fields`],
    enabled: !!activeExtractionId,
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ fieldId, status }: { fieldId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/fields/${fieldId}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/documents/extractions/${activeExtractionId}/fields`] });
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ extractionId, status }: { extractionId: number; status: string }) => {
      const res = await apiRequest("POST", `/api/documents/fields/${extractionId}/bulk-status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/documents/extractions/${activeExtractionId}/fields`] });
      toast({ title: "Fields updated", description: "All fields have been updated." });
    },
  });

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateImageFile(file);
      if (validationError) {
        toast({ title: "Unsupported file type", description: validationError, variant: "destructive" });
        return;
      }
      setUploading(true);
      try {
        const response = await fetch("/api/documents/extract", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "x-property-id": String(propertyId),
            "x-file-name": file.name,
          },
          credentials: "include",
          body: file,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Upload failed");
        }

        const result = await response.json();
        setActiveExtractionId(result.extraction.id);
        queryClient.invalidateQueries({ queryKey: [`/api/documents/extractions/${propertyId}`] });

        toast({
          title: result.extraction.status === "completed" ? "Document processed" : "Processing failed",
          description:
            result.extraction.status === "completed"
              ? `Extracted ${result.fields.length} fields from ${file.name}`
              : result.extraction.errorMessage || "Could not extract data",
          variant: result.extraction.status === "completed" ? "default" : "destructive",
        });
      } catch (error: unknown) {
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [propertyId, queryClient, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const pendingFields = fields.filter((f) => f.status === "pending" && f.mappedPropertyField);
  const unmappedFields = fields.filter((f) => !f.mappedPropertyField);
  const _processedFields = fields.filter((f) => f.status !== "pending");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Document Intelligence
          </CardTitle>
          <CardDescription>
            Upload financial documents (P&L, appraisals, STR reports) to automatically extract and map values to property assumptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              uploading ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            data-testid="dropzone-document-upload"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Processing document...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Drop a document here or click to upload</p>
                  <p className="text-sm text-muted-foreground mt-1">PNG, JPEG, GIF, WebP, TIFF (max 10MB)</p>
                </div>
                <label>
                  <input
                    type="file"
                    className="hidden"
                    accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.tiff"
                    onChange={handleFileSelect}
                    data-testid="input-document-file"
                  />
                  <Button variant="outline" size="sm" asChild>
                    <span>Choose File</span>
                  </Button>
                </label>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {activeExtractionId && fields.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Extraction Results</CardTitle>
              {pendingFields.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkActionMutation.mutate({ extractionId: activeExtractionId, status: "approved" })}
                    disabled={bulkActionMutation.isPending}
                    data-testid="button-bulk-approve"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Approve All ({pendingFields.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkActionMutation.mutate({ extractionId: activeExtractionId, status: "rejected" })}
                    disabled={bulkActionMutation.isPending}
                    data-testid="button-bulk-reject"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Reject All
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Field</th>
                    <th className="p-3 text-left font-medium">Extracted Value</th>
                    <th className="p-3 text-left font-medium">Confidence</th>
                    <th className="p-3 text-left font-medium">Current Value</th>
                    <th className="p-3 text-left font-medium">Maps To</th>
                    <th className="p-3 text-center font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fields
                    .filter((f) => f.mappedPropertyField)
                    .map((field) => (
                      <tr
                        key={field.id}
                        className={`border-b ${field.confidenceLevel === "low" ? "bg-accent-pop/10 dark:bg-accent-pop/5" : ""}`}
                        data-testid={`row-field-${field.id}`}
                      >
                        <td className="p-3">
                          <div className="font-medium">{field.fieldLabel}</div>
                        </td>
                        <td className="p-3 font-mono text-sm">{field.extractedValue}</td>
                        <td className="p-3">
                          <ConfidenceBadge level={field.confidenceLevel} score={field.confidence} />
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-sm">{field.currentValue ?? "—"}</td>
                        <td className="p-3">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{field.mappedPropertyField}</code>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            {field.status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={() => updateFieldMutation.mutate({ fieldId: field.id, status: "approved" })}
                                  disabled={updateFieldMutation.isPending}
                                  data-testid={`button-approve-${field.id}`}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => updateFieldMutation.mutate({ fieldId: field.id, status: "rejected" })}
                                  disabled={updateFieldMutation.isPending}
                                  data-testid={`button-reject-${field.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <StatusIcon status={field.status} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {unmappedFields.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                  <AlertTriangle className="w-4 h-4 text-accent-pop" />
                  {unmappedFields.length} fields could not be mapped to property assumptions
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  {unmappedFields.slice(0, 5).map((f) => (
                    <div key={f.id} className="flex gap-2">
                      <span className="font-medium">{f.fieldLabel}:</span>
                      <span>{f.extractedValue}</span>
                    </div>
                  ))}
                  {unmappedFields.length > 5 && (
                    <p className="italic">...and {unmappedFields.length - 5} more</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {extractions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setExpandedHistory(!expandedHistory)}
              data-testid="button-toggle-history"
            >
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Extraction History ({extractions.length})
              </CardTitle>
              {expandedHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </CardHeader>
          {expandedHistory && (
            <CardContent>
              <div className="space-y-3">
                {extractions.map((extraction) => (
                  <div
                    key={extraction.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => setActiveExtractionId(extraction.id)}
                    data-testid={`card-extraction-${extraction.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{extraction.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(extraction.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={extraction.status === "completed" ? "default" : extraction.status === "failed" ? "destructive" : "secondary"}
                      data-testid={`status-extraction-${extraction.id}`}
                    >
                      {extraction.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
