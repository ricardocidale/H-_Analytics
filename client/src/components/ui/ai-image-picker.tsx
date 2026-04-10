/**
 * ai-image-picker.tsx — Multi-source image selector with AI generation support.
 *
 * Provides three ways to set a property's hero image:
 *   1. Upload a local file from the user's device
 *   2. Paste a URL to an existing image
 *   3. Generate an AI image from a text prompt (calls the backend
 *      image generation endpoint)
 *
 * Used in the AddPropertyDialog and property edit forms.
 */
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, X } from "@/components/icons/themed-icons";
import { IconUpload, IconSparkles, IconLink as LinkIcon } from "@/components/icons";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

type PickerMode = "upload" | "generate" | "url";

interface AIImagePickerProps {
  imageUrl: string;
  onImageChange: (url: string) => void;
  defaultPrompt?: string;
  promptPlaceholder?: string;
  uploadLabel?: string;
  generateLabel?: string;
  variant?: "dark" | "light";
  aspectRatio?: "square" | "landscape" | "portrait";
  maxSizeMB?: number;
  showUrlMode?: boolean;
  context?: string;
  className?: string;
  "data-testid"?: string;
}

export function AIImagePicker({
  imageUrl,
  onImageChange,
  defaultPrompt = "",
  promptPlaceholder = "Describe the image you want to generate...",
  uploadLabel = "Upload Image",
  generateLabel = "Generate with AI",
  variant = "light",
  aspectRatio = "landscape",
  maxSizeMB = 10,
  showUrlMode = false,
  context,
  className,
  "data-testid": testId = "ai-image-picker",
}: AIImagePickerProps) {
  const [mode, setMode] = useState<PickerMode>("upload");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [urlInput, setUrlInput] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ src: string; name: string; type: string; originalFile: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const cropAspect = aspectRatio === "square" ? 1 : aspectRatio === "portrait" ? 3 / 4 : 16 / 10;

  const { uploadFile } = useUpload({
    onSuccess: (response) => {
      onImageChange(response.objectPath);
      toast({ title: "Image Uploaded", description: "Image has been successfully uploaded." });
      setIsUploadingPhoto(false);
    },
    onError: (error) => {
      console.error("Upload failed:", error);
      toast({ title: "Upload Failed", description: "Failed to upload image. Please try again.", variant: "destructive" });
      setIsUploadingPhoto(false);
    },
  });

  const doUpload = async (file: File) => {
    setIsUploadingPhoto(true);
    await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file (JPEG, PNG, etc.)", variant: "destructive" });
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      toast({ title: "File Too Large", description: `Please select an image under ${maxSizeMB}MB.`, variant: "destructive" });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPendingImage({ src: objectUrl, name: file.name, type: file.type, originalFile: file });
    setCropDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = async (croppedFile: File) => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.src);
    if (croppedFile.size === 0) {
      await doUpload(pendingImage!.originalFile);
    } else {
      await doUpload(croppedFile);
    }
    setPendingImage(null);
  };

  const handleCropDialogClose = (open: boolean) => {
    if (!open && pendingImage) {
      URL.revokeObjectURL(pendingImage.src);
      setPendingImage(null);
    }
    setCropDialogOpen(open);
  };

  const handleGenerate = useCallback(async () => {
    const finalPrompt = prompt.trim() || defaultPrompt;
    if (!finalPrompt) {
      toast({ title: "Prompt Required", description: "Enter a description of the image you want.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const res = await fetch("/api/generate-property-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, string>));
        throw new Error(data.error || "Failed to generate image");
      }

      const data = await res.json();
      onImageChange(data.objectPath);
      toast({ title: "Image Generated", description: "AI-generated image is ready." });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Image generation failed");
      setGenerationError(error.message);
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, defaultPrompt, onImageChange, toast]);

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) {
      toast({ title: "URL Required", description: "Please enter an image URL.", variant: "destructive" });
      return;
    }
    onImageChange(urlInput.trim());
    setUrlInput("");
  };

  const handleRemove = () => {
    onImageChange("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isLight = variant === "light";
  const isBusy = isUploadingPhoto || isGenerating;

  const aspectClass = aspectRatio === "square" ? "aspect-square" : aspectRatio === "portrait" ? "aspect-[3/4]" : "aspect-[16/10]";

  const modeButtonClass = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
      active
        ? isLight
          ? "bg-primary/20 text-foreground border border-border"
          : "bg-muted text-foreground border border-border"
        : isLight
          ? "text-muted-foreground hover:text-foreground border border-transparent"
          : "text-muted-foreground hover:text-foreground border border-transparent"
    );

  return (
    <div className={cn("space-y-3", className)} data-testid={testId}>
      <div className="flex gap-2 flex-wrap">
        <Button type="button" variant="ghost" onClick={() => setMode("upload")} disabled={isBusy} className={modeButtonClass(mode === "upload")}>
          <IconUpload className="w-3.5 h-3.5" />
          {uploadLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("generate")} disabled={isBusy} className={modeButtonClass(mode === "generate")}>
          <IconSparkles className="w-3.5 h-3.5" />
          {generateLabel}
        </Button>
        {showUrlMode && (
          <Button type="button" variant="ghost" onClick={() => setMode("url")} disabled={isBusy} className={modeButtonClass(mode === "url")}>
            <LinkIcon className="w-3.5 h-3.5" />
            Enter URL
          </Button>
        )}
      </div>

      {imageUrl ? (
        <div className={cn("relative w-full rounded-lg overflow-hidden border", isLight ? "border-border" : "border-border", aspectClass)}>
          <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }} />
          <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2" onClick={handleRemove} data-testid={`${testId}-remove`}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : mode === "upload" ? (
        <div
          className={cn(
            "w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-colors",
            isBusy ? "cursor-wait border-muted-foreground/25" : "cursor-pointer hover:border-primary/50 border-muted-foreground/25",
            aspectClass
          )}
          onClick={() => !isBusy && fileInputRef.current?.click()}
        >
          {isUploadingPhoto ? (
            <>
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-2" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </>
          ) : (
            <>
              <IconUpload className="w-10 h-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Click to upload image</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Max size: {maxSizeMB}MB</p>
            </>
          )}
        </div>
      ) : mode === "generate" ? (
        <div className="space-y-3">
          {context && (
            <p className={cn("text-xs", isLight ? "text-muted-foreground" : "text-muted-foreground/70")}>{context}</p>
          )}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={promptPlaceholder}
            disabled={isGenerating}
            rows={3}
            data-testid={`${testId}-prompt`}
            className={cn(
              "resize-none",
              isLight ? "bg-card border-border text-foreground placeholder:text-muted-foreground" : "bg-card border-border text-foreground placeholder:text-muted-foreground"
            )}
          />
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || (!prompt.trim() && !defaultPrompt)}
            data-testid={`${testId}-generate`}
            className="bg-primary/20 border-border text-foreground hover:bg-primary/30"
            variant="outline"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generating with Norfolk AI...
              </>
            ) : (
              <>
                <IconSparkles className="w-4 h-4 mr-2" />
                Generate Image
              </>
            )}
          </Button>
          {generationError && (
            <p className="text-xs text-destructive">{generationError}</p>
          )}
          {!prompt.trim() && defaultPrompt && (
            <p className={cn("text-xs", isLight ? "text-muted-foreground" : "text-muted-foreground/70")}>
              Leave blank to use: "{defaultPrompt}"
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.png"
              data-testid={`${testId}-url-input`}
              className={isLight ? "bg-card border-border" : "bg-card border-border"}
            />
            <Button type="button" variant="outline" onClick={handleUrlSubmit} disabled={!urlInput.trim()} data-testid={`${testId}-url-submit`}>
              Apply
            </Button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} data-testid={`${testId}-file-input`} />

      {pendingImage && (
        <ImageCropDialog
          open={cropDialogOpen}
          onOpenChange={handleCropDialogClose}
          imageSrc={pendingImage.src}
          fileName={pendingImage.name}
          fileType={pendingImage.type}
          aspectRatio={cropAspect}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
