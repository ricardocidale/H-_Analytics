import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Download,
  Pencil,
  Trash2,
  RefreshCw,
  MoreHorizontal,
} from "@/components/icons/themed-icons";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@shared/document-types";

const ALLOWED_DOC_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/webp",
];
const ALLOWED_DOC_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp";
const ALLOWED_DOC_LABEL = "PDF, PNG, JPEG, TIFF, or WebP (max 20 MB)";
const MAX_DOC_MB = 20;

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

interface DocumentLibraryRow {
  id: number;
  propertyId: number;
  fileName: string;
  fileContentType: string;
  documentType: string;
  status: string;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
  totalFields: number;
  pendingFields: number;
  approvedFields: number;
  rejectedFields: number;
}

interface PostUploadState {
  extraction: DocumentLibraryRow;
  fileSize: number;
}

interface CollisionField {
  fieldId: number;
  fieldLabel: string;
  mappedPropertyField: string;
  extractedValue: string;
  currentPropertyValue: string;
}

interface CollisionState {
  extractionId: number;
  collisions: CollisionField[];
  safeFieldIds: number[];
  resolutions: Record<number, "replace" | "keep" | "skip">;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="w-4 h-4 text-primary" />;
    case "processing": return <Loader2 className="w-4 h-4 text-accent-pop animate-spin" />;
    case "failed": return <XCircle className="w-4 h-4 text-destructive" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    completed: "bg-primary/15 text-primary border-primary/20",
    processing: "bg-accent-pop/15 text-accent-pop border-accent-pop/20",
    failed: "bg-destructive/15 text-destructive border-destructive/20",
    uploaded: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${variants[status] ?? variants.uploaded}`}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

function DocTypePill({ type }: { type: string }) {
  const label = DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
      {label}
    </span>
  );
}

function ConfidenceBadge({ level, score }: { level: string; score: number }) {
  const variants: Record<string, string> = {
    high: "bg-primary/15 text-primary border-primary/20",
    medium: "bg-accent-pop/15 text-accent-pop border-accent-pop/20",
    low: "bg-destructive/15 text-destructive border-destructive/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[level] ?? variants.low}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)} ({(score * 100).toFixed(0)}%)
    </span>
  );
}

export default function DocumentExtractionPanel({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [postUpload, setPostUpload] = useState<PostUploadState | null>(null);
  const [pendingDocType, setPendingDocType] = useState<string>("general");
  const [activeExtractionId, setActiveExtractionId] = useState<number | null>(null);

  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [retagTarget, setRetagTarget] = useState<{ id: number; type: string } | null>(null);
  const [retagValue, setRetagValue] = useState<string>("general");
  const [collisionState, setCollisionState] = useState<CollisionState | null>(null);

  const libraryQueryKey = [`/api/documents/library/${propertyId}`];
  const fieldsQueryKey = [`/api/documents/extractions/${activeExtractionId}/fields`];

  const { data: library = [] } = useQuery<DocumentLibraryRow[]>({
    queryKey: libraryQueryKey,
    refetchInterval: (query) => {
      const data = (query.state.data as DocumentLibraryRow[] | undefined) ?? [];
      return data.some((d) => d.status === "processing") ? 3000 : false;
    },
  });

  const { data: fields = [] } = useQuery<ExtractionField[]>({
    queryKey: fieldsQueryKey,
    enabled: !!activeExtractionId,
  });

  function invalidateLibrary() {
    queryClient.invalidateQueries({ queryKey: libraryQueryKey });
  }

  const analyzeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/documents/extractions/${id}/analyze`);
      return res.json();
    },
    onSuccess: () => {
      invalidateLibrary();
      if (activeExtractionId) {
        queryClient.invalidateQueries({ queryKey: fieldsQueryKey });
      }
    },
    onError: () => toast({ title: "Analysis failed", description: "Could not analyze the document.", variant: "destructive" }),
  });

  const retagMutation = useMutation({
    mutationFn: async ({ id, documentType }: { id: number; documentType: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/extractions/${id}/type`, { documentType });
      return res.json();
    },
    onSuccess: () => { invalidateLibrary(); setRetagTarget(null); },
    onError: () => toast({ title: "Failed to update type", variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, fileName }: { id: number; fileName: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/extractions/${id}/rename`, { fileName });
      return res.json();
    },
    onSuccess: () => { invalidateLibrary(); setRenameTarget(null); },
    onError: () => toast({ title: "Failed to rename document", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/documents/extractions/${id}`);
    },
    onSuccess: (_, id) => {
      invalidateLibrary();
      if (activeExtractionId === id) setActiveExtractionId(null);
      setDeleteTarget(null);
      toast({ title: "Document deleted" });
    },
    onError: () => toast({ title: "Failed to delete document", variant: "destructive" }),
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ fieldId, status }: { fieldId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/fields/${fieldId}/status`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fieldsQueryKey }),
  });

  const applyMutation = useMutation({
    mutationFn: async ({ extractionId, resolutions }: { extractionId: number; resolutions: Record<string, string> }) => {
      const res = await apiRequest("POST", `/api/documents/extractions/${extractionId}/apply`, { resolutions });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fieldsQueryKey });
      invalidateLibrary();
      setCollisionState(null);
      toast({ title: "Fields applied", description: "Selected field values have been saved to the property." });
    },
    onError: () => toast({ title: "Failed to apply fields", variant: "destructive" }),
  });

  async function checkCollisionsAndApply(extractionId: number, fieldIds: number[]) {
    try {
      const res = await apiRequest("POST", `/api/documents/extractions/${extractionId}/collision-preview`, { fieldIds });
      const { collisions, safeFieldIds }: { collisions: CollisionField[]; safeFieldIds: number[] } = await res.json();

      if (collisions.length === 0) {
        const resolutions = Object.fromEntries(fieldIds.map((id) => [String(id), "replace"]));
        applyMutation.mutate({ extractionId, resolutions });
      } else {
        const initialResolutions = Object.fromEntries(
          collisions.map((c) => [c.fieldId, "replace" as const]),
        );
        setCollisionState({ extractionId, collisions, safeFieldIds, resolutions: initialResolutions });
      }
    } catch {
      toast({ title: "Could not check for conflicts", variant: "destructive" });
    }
  }

  function handleApproveField(field: ExtractionField) {
    if (!activeExtractionId) return;
    checkCollisionsAndApply(activeExtractionId, [field.id]);
  }

  function handleApproveAll() {
    if (!activeExtractionId) return;
    const pendingMapped = fields.filter((f) => f.status === "pending" && f.mappedPropertyField);
    if (pendingMapped.length === 0) return;
    checkCollisionsAndApply(activeExtractionId, pendingMapped.map((f) => f.id));
  }

  function confirmCollisionApply() {
    if (!collisionState) return;
    const allResolutions: Record<string, string> = {};
    for (const id of collisionState.safeFieldIds) allResolutions[String(id)] = "replace";
    for (const [id, res] of Object.entries(collisionState.resolutions)) allResolutions[String(id)] = res;
    applyMutation.mutate({ extractionId: collisionState.extractionId, resolutions: allResolutions });
  }

  function validateDocFile(file: File): string | null {
    if (!ALLOWED_DOC_MIME.includes(file.type)) return `"${file.name}" is not a supported format. Use ${ALLOWED_DOC_LABEL}.`;
    if (file.size > MAX_DOC_MB * 1024 * 1024) return `"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max ${MAX_DOC_MB} MB.`;
    return null;
  }

  const handleUpload = useCallback(async (file: File) => {
    const err = validateDocFile(file);
    if (err) { toast({ title: "Unsupported file", description: err, variant: "destructive" }); return; }
    setUploading(true);
    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-property-id": String(propertyId),
          "x-file-name": file.name,
        },
        credentials: "include",
        body: file,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || "Upload failed");
      }
      const json: { extraction: DocumentLibraryRow; fileSize: number; suggestedType: string } = await res.json();
      setPostUpload({ extraction: json.extraction, fileSize: json.fileSize });
      setPendingDocType(json.suggestedType || "general");
      invalidateLibrary();
    } catch (error: unknown) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "An error occurred", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [propertyId, toast, invalidateLibrary]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }, [handleUpload]);

  function triggerAnalyzeForPostUpload() {
    if (!postUpload) return;
    const id = postUpload.extraction.id;
    if (pendingDocType !== postUpload.extraction.documentType) {
      retagMutation.mutate({ id, documentType: pendingDocType }, {
        onSettled: () => analyzeMutation.mutate(id),
      });
    } else {
      analyzeMutation.mutate(id);
    }
    setPostUpload(null);
    setActiveExtractionId(id);
    toast({ title: "Analyzing document", description: "The Analyst is reading your document. Results will appear below." });
  }

  function dismissPostUpload() {
    if (postUpload && pendingDocType !== postUpload.extraction.documentType) {
      retagMutation.mutate({ id: postUpload.extraction.id, documentType: pendingDocType });
    }
    setPostUpload(null);
  }

  const pendingFields = fields.filter((f) => f.status === "pending" && f.mappedPropertyField);
  const unmappedFields = fields.filter((f) => f.status === "pending" && !f.mappedPropertyField);
  const activeDoc = library.find((d) => d.id === activeExtractionId);

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Document Library
          </CardTitle>
          <CardDescription>
            Upload financial documents to your property library. Have the Analyst extract key assumptions when you're ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${uploading ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            data-testid="dropzone-document-upload"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-accent-pop" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Drop a document here or click to upload</p>
                  <p className="text-sm text-muted-foreground mt-1">{ALLOWED_DOC_LABEL}</p>
                </div>
                <label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={ALLOWED_DOC_EXTENSIONS}
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

      {/* Post-upload acknowledgement */}
      {postUpload && (
        <Card className="border-primary/30 bg-primary/5" data-testid="card-post-upload">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" data-testid="text-post-upload-filename">
                    {postUpload.extraction.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="text-post-upload-size">
                    {formatBytes(postUpload.fileSize)} · uploaded
                  </p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Document type:</span>
                    <Select value={pendingDocType} onValueChange={setPendingDocType}>
                      <SelectTrigger className="h-7 w-44 text-xs" data-testid="select-post-upload-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {DOCUMENT_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={dismissPostUpload}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" onClick={triggerAnalyzeForPostUpload} data-testid="button-analyze-post-upload">
                Analyze with Analyst
              </Button>
              <Button size="sm" variant="outline" onClick={dismissPostUpload} data-testid="button-not-now-post-upload">
                Not now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document library */}
      {library.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Library ({library.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Document</th>
                    <th className="p-3 text-left font-medium hidden sm:table-cell">Type</th>
                    <th className="p-3 text-left font-medium">Status</th>
                    <th className="p-3 text-left font-medium hidden md:table-cell">Fields</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {library.map((doc) => (
                    <tr
                      key={doc.id}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${activeExtractionId === doc.id ? "bg-primary/5" : ""}`}
                      data-testid={`row-doc-${doc.id}`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[16rem]" title={doc.fileName}>
                              {doc.fileName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <DocTypePill type={doc.documentType} />
                      </td>
                      <td className="p-3">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="p-3 hidden md:table-cell text-sm text-muted-foreground">
                        {doc.status === "completed"
                          ? `${doc.approvedFields}/${doc.totalFields} applied`
                          : doc.totalFields > 0
                          ? `${doc.totalFields} fields`
                          : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {doc.status === "completed" && doc.pendingFields > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs hidden sm:inline-flex"
                              onClick={() => setActiveExtractionId(activeExtractionId === doc.id ? null : doc.id)}
                              data-testid={`button-review-${doc.id}`}
                            >
                              Review ({doc.pendingFields})
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`button-actions-${doc.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {doc.status === "completed" && (
                                <DropdownMenuItem
                                  onClick={() => setActiveExtractionId(activeExtractionId === doc.id ? null : doc.id)}
                                  data-testid={`menu-review-${doc.id}`}
                                >
                                  <Check className="w-4 h-4 mr-2" />
                                  Review fields
                                </DropdownMenuItem>
                              )}
                              {(doc.status === "uploaded" || doc.status === "failed") && (
                                <DropdownMenuItem
                                  onClick={() => analyzeMutation.mutate(doc.id)}
                                  disabled={analyzeMutation.isPending}
                                  data-testid={`menu-analyze-${doc.id}`}
                                >
                                  <RefreshCw className="w-4 h-4 mr-2" />
                                  Analyze with Analyst
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => { setRenameTarget({ id: doc.id, name: doc.fileName }); setRenameValue(doc.fileName); }}
                                data-testid={`menu-rename-${doc.id}`}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => { setRetagTarget({ id: doc.id, type: doc.documentType }); setRetagValue(doc.documentType); }}
                                data-testid={`menu-retag-${doc.id}`}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                Change type
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a
                                  href={`/api/documents/extractions/${doc.id}/download`}
                                  download={doc.fileName}
                                  data-testid={`menu-download-${doc.id}`}
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Download
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget({ id: doc.id, name: doc.fileName })}
                                data-testid={`menu-delete-${doc.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extraction results panel */}
      {activeExtractionId && fields.length > 0 && activeDoc && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Extraction Results</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{activeDoc.fileName}</p>
              </div>
              <div className="flex items-center gap-2">
                {pendingFields.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleApproveAll}
                      disabled={applyMutation.isPending}
                      data-testid="button-bulk-approve"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Approve All ({pendingFields.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const ids = pendingFields.map((f) => f.id);
                        const resolutions = Object.fromEntries(ids.map((id) => [String(id), "rejected"]));
                        applyMutation.mutate({ extractionId: activeExtractionId, resolutions: Object.fromEntries(ids.map((id) => [String(id), "keep"])) });
                      }}
                      disabled={applyMutation.isPending}
                      data-testid="button-bulk-reject"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Reject All
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setActiveExtractionId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Field</th>
                    <th className="p-3 text-left font-medium">Extracted</th>
                    <th className="p-3 text-left font-medium hidden md:table-cell">Confidence</th>
                    <th className="p-3 text-left font-medium hidden md:table-cell">Current</th>
                    <th className="p-3 text-left font-medium hidden lg:table-cell">Maps to</th>
                    <th className="p-3 text-center font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.filter((f) => f.mappedPropertyField).map((field) => (
                    <tr
                      key={field.id}
                      className={`border-b last:border-0 ${field.confidenceLevel === "low" ? "bg-accent-pop/5" : ""}`}
                      data-testid={`row-field-${field.id}`}
                    >
                      <td className="p-3 font-medium">{field.fieldLabel}</td>
                      <td className="p-3 font-mono text-sm">{field.extractedValue}</td>
                      <td className="p-3 hidden md:table-cell">
                        <ConfidenceBadge level={field.confidenceLevel} score={field.confidence} />
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-sm hidden md:table-cell">
                        {field.currentValue ?? "—"}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{field.mappedPropertyField}</code>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          {field.status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                                onClick={() => handleApproveField(field)}
                                disabled={applyMutation.isPending}
                                data-testid={`button-approve-${field.id}`}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => updateFieldMutation.mutate({ fieldId: field.id, status: "rejected" })}
                                disabled={updateFieldMutation.isPending}
                                data-testid={`button-reject-${field.id}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : field.status === "approved" ? (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          ) : (
                            <XCircle className="w-4 h-4 text-destructive" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {unmappedFields.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                  <AlertTriangle className="w-4 h-4 text-accent-pop" />
                  {unmappedFields.length} field{unmappedFields.length > 1 ? "s" : ""} could not be mapped to property assumptions
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  {unmappedFields.slice(0, 5).map((f) => (
                    <div key={f.id} className="flex gap-2">
                      <span className="font-medium">{f.fieldLabel}:</span>
                      <span>{f.extractedValue}</span>
                    </div>
                  ))}
                  {unmappedFields.length > 5 && <p className="italic">…and {unmappedFields.length - 5} more</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>Enter a new name for this document.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && renameTarget) renameMutation.mutate({ id: renameTarget.id, fileName: renameValue }); }}
            placeholder="Document name"
            data-testid="input-rename"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              onClick={() => { if (renameTarget) renameMutation.mutate({ id: renameTarget.id, fileName: renameValue }); }}
              disabled={!renameValue.trim() || renameMutation.isPending}
              data-testid="button-rename-confirm"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-tag dialog */}
      <Dialog open={!!retagTarget} onOpenChange={(open) => { if (!open) setRetagTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change document type</DialogTitle>
            <DialogDescription>Select the type that best describes this document.</DialogDescription>
          </DialogHeader>
          <Select value={retagValue} onValueChange={setRetagValue}>
            <SelectTrigger data-testid="select-retag-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetagTarget(null)}>Cancel</Button>
            <Button
              onClick={() => { if (retagTarget) retagMutation.mutate({ id: retagTarget.id, documentType: retagValue }); }}
              disabled={retagMutation.isPending}
              data-testid="button-retag-confirm"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently removed — the file, extraction data, and any vector-store entries will all be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
              data-testid="button-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Collision resolution dialog */}
      <Dialog open={!!collisionState} onOpenChange={(open) => { if (!open) setCollisionState(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resolve conflicts</DialogTitle>
            <DialogDescription>
              The following extracted values differ from your current property assumptions. Choose how to handle each.
            </DialogDescription>
          </DialogHeader>
          {collisionState && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-end gap-2 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setCollisionState((s) => s ? {
                    ...s,
                    resolutions: Object.fromEntries(s.collisions.map((c) => [c.fieldId, "replace"])),
                  } : null)}
                >
                  Replace all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setCollisionState((s) => s ? {
                    ...s,
                    resolutions: Object.fromEntries(s.collisions.map((c) => [c.fieldId, "keep"])),
                  } : null)}
                >
                  Keep all current
                </Button>
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2.5 text-left font-medium">Field</th>
                      <th className="p-2.5 text-left font-medium">Current</th>
                      <th className="p-2.5 text-left font-medium">Extracted</th>
                      <th className="p-2.5 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collisionState.collisions.map((c) => {
                      const resolution = collisionState.resolutions[c.fieldId] ?? "replace";
                      return (
                        <tr key={c.fieldId} className="border-b last:border-0">
                          <td className="p-2.5 font-medium text-xs">{c.fieldLabel}</td>
                          <td className="p-2.5 font-mono text-xs text-muted-foreground">{c.currentPropertyValue}</td>
                          <td className="p-2.5 font-mono text-xs">{c.extractedValue}</td>
                          <td className="p-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant={resolution === "replace" ? "default" : "outline"}
                                className="h-6 px-2 text-xs"
                                onClick={() => setCollisionState((s) => s ? {
                                  ...s,
                                  resolutions: { ...s.resolutions, [c.fieldId]: "replace" },
                                } : null)}
                                data-testid={`collision-replace-${c.fieldId}`}
                              >
                                Replace
                              </Button>
                              <Button
                                size="sm"
                                variant={resolution === "keep" ? "default" : "outline"}
                                className="h-6 px-2 text-xs"
                                onClick={() => setCollisionState((s) => s ? {
                                  ...s,
                                  resolutions: { ...s.resolutions, [c.fieldId]: "keep" },
                                } : null)}
                                data-testid={`collision-keep-${c.fieldId}`}
                              >
                                Keep current
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {collisionState.safeFieldIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {collisionState.safeFieldIds.length} non-conflicting field{collisionState.safeFieldIds.length > 1 ? "s" : ""} will be applied automatically.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollisionState(null)}>Cancel</Button>
            <Button onClick={confirmCollisionApply} disabled={applyMutation.isPending} data-testid="button-collision-confirm">
              {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Apply selections
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
