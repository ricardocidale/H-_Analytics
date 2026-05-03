import { useState, useRef } from "react";
import { Upload, Loader2, X, ImagePlus, Crop, CheckCircle2, AlertTriangle } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { validateImageFile } from "@/hooks/use-upload";
import { useAddPropertyPhoto } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "./ImageCropDialog";

interface PhotoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: number;
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

type UploadStatus = "queued" | "uploading" | "done" | "failed";

interface UploadItem {
  file: File;
  caption: string;
  status: UploadStatus;
  errorMessage?: string;
  objectPath?: string;
  crop?: CropRegion | null;
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  queued: "Queued",
  uploading: "Uploading",
  done: "Done",
  failed: "Failed",
};

async function uploadFileDirect(file: File): Promise<string> {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const arrayBuffer = await file.arrayBuffer();
  const response = await fetch("/api/uploads/direct", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    credentials: "include",
    body: arrayBuffer,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({} as Record<string, string>));
    throw new Error(errorData.error || `Upload failed (${response.status})`);
  }

  const data = await response.json();
  if (!data?.objectPath) throw new Error("Upload succeeded but no object path was returned");
  return data.objectPath as string;
}

export function PhotoUploadDialog({ open, onOpenChange, propertyId }: PhotoUploadDialogProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const addPhoto = useAddPropertyPhoto();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast({ title: "No images selected", description: "Please select image files.", variant: "destructive" });
      return;
    }
    const newItems: UploadItem[] = imageFiles.map((file) => ({
      file,
      caption: "",
      status: "queued",
      crop: null,
    }));
    setItems((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadAll = async () => {
    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "queued") continue;
      setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, status: "uploading", errorMessage: undefined } : item));

      try {
        const objectPath = await uploadFileDirect(items[i].file);

        const hasCrop = !!items[i].crop;
        const photo = await addPhoto.mutateAsync({
          propertyId,
          imageUrl: objectPath,
          caption: items[i].caption || undefined,
          skipProcessing: hasCrop,
        });

        if (hasCrop) {
          fetch("/api/uploads/process-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              propertyId,
              photoId: photo.id,
              imageUrl: objectPath,
              crop: items[i].crop,
            }),
          }).catch((err) => console.error("Image processing error:", err));
        }

        setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, status: "done", objectPath } : item));
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, status: "failed", errorMessage: message } : item));
        failCount++;
      }
    }

    setIsUploading(false);

    if (successCount > 0 && failCount === 0) {
      toast({ title: `${successCount} photo${successCount > 1 ? "s" : ""} uploaded` });
      setTimeout(() => {
        setItems([]);
        onOpenChange(false);
      }, 600);
    } else if (successCount > 0 && failCount > 0) {
      toast({
        title: `${successCount} uploaded, ${failCount} failed`,
        description: "Review the failed files below and retry or remove them.",
        variant: "destructive",
      });
    } else if (failCount > 0) {
      toast({
        title: `${failCount} photo${failCount > 1 ? "s" : ""} failed to upload`,
        description: "See per-file errors below.",
        variant: "destructive",
      });
    }
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const retryItem = (index: number) => {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, status: "queued", errorMessage: undefined } : item));
  };

  const clearFinished = () => {
    setItems((prev) => prev.filter((item) => item.status === "queued" || item.status === "uploading"));
  };

  const updateCaption = (index: number, caption: string) => {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, caption } : item));
  };

  const handleCropComplete = (crop: CropRegion | null) => {
    if (cropIndex !== null) {
      setItems((prev) => prev.map((item, i) => i === cropIndex ? { ...item, crop } : item));
    }
    setCropIndex(null);
  };

  const queuedCount = items.filter((i) => i.status === "queued").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const totalCount = items.length;
  const finishedCount = doneCount + failedCount;
  const overallPct = totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0;
  const hasFinished = doneCount > 0 || failedCount > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Upload Photos
            </DialogTitle>
            <DialogDescription>Add photos to the property album. Images are automatically optimized with multiple sizes.</DialogDescription>
          </DialogHeader>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            data-testid="upload-dropzone"
          >
            <ImagePlus className="w-8 h-8 mx-auto text-primary/40 mb-2" />
            <p className="text-sm text-muted-foreground">Click to select images or drag and drop</p>
            <p className="text-xs text-muted-foreground/60 mt-1">JPEG, PNG, WebP, TIFF, BMP up to 10MB each</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-file-upload"
          />

          {totalCount > 0 && (isUploading || hasFinished) && (
            <div className="space-y-1" data-testid="upload-overall-progress">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span data-testid="text-upload-progress">
                  {finishedCount} of {totalCount} processed
                  {doneCount > 0 ? ` · ${doneCount} done` : ""}
                  {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                </span>
                <span>{overallPct}%</span>
              </div>
              <Progress value={overallPct} className="h-1.5" />
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {items.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-2 rounded-lg ${item.status === "failed" ? "bg-destructive/10 border border-destructive/30" : "bg-muted/50"}`}
                  data-testid={`upload-item-${i}`}
                >
                  <img
                    src={URL.createObjectURL(item.file)}
                    alt=""
                    className="w-10 h-10 rounded object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" title={item.file.name}>{item.file.name}</p>
                    <Input
                      value={item.caption}
                      onChange={(e) => updateCaption(i, e.target.value)}
                      placeholder="Caption (optional)"
                      className="h-6 text-xs mt-1"
                      disabled={item.status !== "queued"}
                      data-testid={`input-caption-${i}`}
                    />
                    {item.status === "failed" && item.errorMessage && (
                      <p className="text-[11px] text-destructive mt-1 break-words" data-testid={`text-error-${i}`}>
                        {item.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1 pt-0.5">
                    {item.status === "queued" && (
                      <>
                        {item.crop && (
                          <span className="text-[10px] text-primary font-medium mr-1">Cropped</span>
                        )}
                        <span className="text-[10px] text-muted-foreground mr-1" data-testid={`status-${i}`}>{STATUS_LABEL.queued}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setCropIndex(i)}
                          title="Adjust crop"
                          data-testid={`button-crop-${i}`}
                        >
                          <Crop className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => removeItem(i)}
                          data-testid={`button-remove-${i}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {item.status === "uploading" && (
                      <span className="flex items-center gap-1 text-xs text-primary font-medium" data-testid={`status-${i}`}>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop" />
                        {STATUS_LABEL.uploading}
                      </span>
                    )}
                    {item.status === "done" && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium" data-testid={`status-${i}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {STATUS_LABEL.done}
                      </span>
                    )}
                    {item.status === "failed" && (
                      <div className="flex items-center gap-1">
                        <span className="flex items-center gap-1 text-xs text-destructive font-medium" data-testid={`status-${i}`}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {STATUS_LABEL.failed}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => retryItem(i)}
                          disabled={isUploading}
                          data-testid={`button-retry-${i}`}
                        >
                          Retry
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => removeItem(i)}
                          disabled={isUploading}
                          data-testid={`button-remove-${i}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {hasFinished && !isUploading && (
              <Button
                variant="ghost"
                onClick={clearFinished}
                data-testid="button-clear-finished"
              >
                Clear finished
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => { setItems([]); onOpenChange(false); }}
              disabled={isUploading}
              data-testid="button-cancel"
            >
              {hasFinished && queuedCount === 0 ? "Close" : "Cancel"}
            </Button>
            <Button
              onClick={handleUploadAll}
              disabled={queuedCount === 0 || isUploading}
              data-testid="button-upload-all"
            >
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin text-accent-pop" />Uploading {finishedCount + 1} of {totalCount}...</>
              ) : failedCount > 0 && queuedCount > 0 ? (
                `Retry ${queuedCount} Photo${queuedCount !== 1 ? "s" : ""}`
              ) : (
                `Upload ${queuedCount} Photo${queuedCount !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {cropIndex !== null && items[cropIndex] && (
        <ImageCropDialog
          open={true}
          onOpenChange={(open) => { if (!open) setCropIndex(null); }}
          imageSrc={URL.createObjectURL(items[cropIndex].file)}
          onCropComplete={handleCropComplete}
        />
      )}
    </>
  );
}
