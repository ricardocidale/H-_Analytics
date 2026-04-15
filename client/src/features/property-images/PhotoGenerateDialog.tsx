import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, Plus, Star, AlertTriangle, ImageIcon, ArrowUp, Images, Crop } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useGenerateImage, type GenerationStyle } from "./useGenerateImage";
import { useAddPropertyPhoto } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Progress } from "@/components/ui/progress";
import type { PropertyPhoto } from "@shared/schema";

interface PhotoGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: number;
  propertyName?: string;
  location?: string;
  roomCount?: number;
  propertyType?: string;
  existingPhotos?: PropertyPhoto[];
}

interface StyleMeta {
  label: string;
  description: string;
  badge: string;
  needsSourcePhoto: boolean;
  promptOptional: boolean;
  sourcePhotoLabel: string;
}

const STYLE_META: Record<GenerationStyle, StyleMeta> = {
  "standard": {
    label: "Standard",
    description: "Gemini / OpenAI — general purpose",
    badge: "General",
    needsSourcePhoto: false,
    promptOptional: false,
    sourcePhotoLabel: "Source Photo",
  },
  "architectural-exterior": {
    label: "Architectural Exterior",
    description: "FLUX 1.1 Pro — photorealistic building renders",
    badge: "FLUX Pro",
    needsSourcePhoto: false,
    promptOptional: false,
    sourcePhotoLabel: "Source Photo",
  },
  "interior-design": {
    label: "Interior Design",
    description: "FLUX 1.1 Pro — professional interior photography",
    badge: "FLUX Pro",
    needsSourcePhoto: false,
    promptOptional: false,
    sourcePhotoLabel: "Source Photo",
  },
  "renovation-concept": {
    label: "Renovation Concept",
    description: "AI interior designer — transforms a before photo",
    badge: "Img2Img",
    needsSourcePhoto: true,
    promptOptional: false,
    sourcePhotoLabel: "Before Photo",
  },
  "photo-upscale": {
    label: "Photo Upscale",
    description: "Clarity Upscaler — 2× resolution enhancement",
    badge: "Upscale",
    needsSourcePhoto: true,
    promptOptional: true,
    sourcePhotoLabel: "Photo to Upscale",
  },
  "virtual-staging": {
    label: "Virtual Staging",
    description: "FLUX 1.1 Pro — furnished and staged room renders",
    badge: "FLUX Pro",
    needsSourcePhoto: false,
    promptOptional: false,
    sourcePhotoLabel: "Source Photo",
  },
  "background-remove": {
    label: "Background Remove",
    description: "AI background removal — transparent PNG output",
    badge: "Tool",
    needsSourcePhoto: true,
    promptOptional: true,
    sourcePhotoLabel: "Photo to Process",
  },
  "photo-to-render": {
    label: "Photo to Render",
    description: "Transforms a photo into a photorealistic architectural render",
    badge: "Img2Img",
    needsSourcePhoto: true,
    promptOptional: false,
    sourcePhotoLabel: "Source Photo",
  },
};

function buildAutoPrompt(
  style: GenerationStyle,
  name?: string,
  location?: string,
  roomCount?: number,
  type?: string,
): string {
  if (style === "background-remove") return "";
  if (style === "photo-upscale") {
    return "luxury real estate photography, enhance clarity and detail";
  }
  if (style === "virtual-staging") {
    return [
      "Furnished luxury boutique hotel room",
      location,
      "with premium furnishings and tasteful decor",
    ].filter(Boolean).join(", ");
  }
  if (style === "photo-to-render") {
    return [
      "Photorealistic architectural visualization render",
      name,
      location,
      "preserve room layout and furniture positions, CGI-quality lighting",
    ].filter(Boolean).join(", ");
  }
  const parts = [
    style === "interior-design" ? "Luxury boutique hotel interior" : "Luxury boutique property exterior",
    name,
    location,
    roomCount ? `${roomCount}-room property` : undefined,
    type ? `${type} style` : undefined,
    "ultra-photorealistic architectural photography, golden hour lighting, professional real estate photography, 8K resolution, sharp detail",
  ].filter(Boolean);
  return parts.join(", ");
}

export function PhotoGenerateDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  location,
  roomCount,
  propertyType,
  existingPhotos = [],
}: PhotoGenerateDialogProps) {
  const [selectedStyle, setSelectedStyle] = useState<GenerationStyle>("standard");
  const [prompt, setPrompt] = useState(() => buildAutoPrompt("standard", propertyName, location, roomCount, propertyType));
  const [caption, setCaption] = useState("");
  const [setAsHero, setSetAsHero] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [sourcePhotoId, setSourcePhotoId] = useState<number | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [generatedStyle, setGeneratedStyle] = useState<string | null>(null);

  const { data: enabledStylesData } = useQuery<{ styles: Array<{ key: string; label: string; enabled: boolean }> }>({
    queryKey: ["/api/replicate/styles"],
    enabled: open,
  });
  const enabledStyleKeys = new Set(
    enabledStylesData?.styles
      ?.filter((s) => s.enabled)
      .map((s) => s.key) ?? Object.keys(STYLE_META)
  );
  const visibleStyles = (Object.entries(STYLE_META) as [GenerationStyle, StyleMeta][]).filter(
    ([key]) => enabledStyleKeys.has(key)
  );

  const meta = STYLE_META[selectedStyle];
  const heroPhoto = existingPhotos.find((p) => p.isHero) ?? existingPhotos[0] ?? null;

  useEffect(() => {
    if (open && heroPhoto && sourcePhotoId === null) {
      setSourcePhotoId(heroPhoto.id);
    }
  }, [open]);

  useEffect(() => {
    setPrompt(buildAutoPrompt(selectedStyle, propertyName, location, roomCount, propertyType));
  }, [selectedStyle, propertyName, location, roomCount, propertyType]);

  const { toast } = useToast();
  const addPhoto = useAddPropertyPhoto();

  const [generatedImageData, setGeneratedImageData] = useState<string | null>(null);

  const { generateImage, isGenerating, generationStatus } = useGenerateImage({
    onSuccess: (objectPath, result) => {
      setGeneratedUrl(objectPath);
      setGeneratedStyle(result.style);
      setGeneratedImageData(result.imageData ?? null);
      if (result.usedFallback && result.fallbackNotice) {
        setFallbackNotice(result.fallbackNotice);
        toast({ title: "Fallback used", description: result.fallbackNotice });
      } else {
        setFallbackNotice(null);
        toast({ title: "Image generated", description: "Preview below. Click 'Add to Album' to save." });
      }
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Please try again with a different prompt.", variant: "destructive" });
    },
  });

  const handleStyleChange = (value: GenerationStyle) => {
    setSelectedStyle(value);
    setGeneratedUrl(null);
    setFallbackNotice(null);
  };

  const handleGenerate = () => {
    setGeneratedUrl(null);
    setFallbackNotice(null);

    let sourceImageUrl: string | undefined;
    if (meta.needsSourcePhoto && sourcePhotoId) {
      const photo = existingPhotos.find((p) => p.id === sourcePhotoId);
      if (photo) sourceImageUrl = photo.imageUrl;
    }

    generateImage(prompt, selectedStyle, sourceImageUrl);
  };

  const handleAddToAlbum = async () => {
    if (!generatedUrl) return;
    try {
      await addPhoto.mutateAsync({
        propertyId,
        imageUrl: generatedUrl,
        caption: caption || undefined,
        generationStyle: generatedStyle || undefined,
        beforePhotoId: meta.needsSourcePhoto ? (sourcePhotoId ?? undefined) : undefined,
        imageData: generatedImageData || undefined,
      });
      toast({ title: "Photo added to album" });
      setGeneratedUrl(null);
      setCaption("");
      setFallbackNotice(null);
    } catch {
      toast({ title: "Failed to add photo", variant: "destructive" });
    }
  };

  const handleClose = () => {
    setGeneratedUrl(null);
    setCaption("");
    setPrompt(buildAutoPrompt(selectedStyle, propertyName, location, roomCount, propertyType));
    setSelectedStyle("standard");
    setSourcePhotoId(null);
    setFallbackNotice(null);
    setGeneratedStyle(null);
    setGeneratedImageData(null);
    onOpenChange(false);
  };

  const sourcePhotoMissing = meta.needsSourcePhoto && !sourcePhotoId;
  const isDisabled =
    isGenerating ||
    (!meta.promptOptional && !prompt.trim()) ||
    (meta.needsSourcePhoto && existingPhotos.length > 0 && !sourcePhotoId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Generate AI Photo
          </DialogTitle>
          <DialogDescription>
            Create a professional property image using AI.
            <InfoTooltip text="Standard uses Gemini/OpenAI. FLUX Pro styles use state-of-the-art photorealistic rendering. Img2Img styles transform an existing photo." />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Style</label>
            <Select
              value={selectedStyle}
              onValueChange={(v) => handleStyleChange(v as GenerationStyle)}
            >
              <SelectTrigger data-testid="select-generation-style">
                <SelectValue placeholder="Choose style..." />
              </SelectTrigger>
              <SelectContent>
                {visibleStyles.map(([value, m]) => (
                  <SelectItem key={value} value={value} data-testid={`style-option-${value}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-xs text-muted-foreground">{m.description}</span>
                      </div>
                      <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{m.badge}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {meta.needsSourcePhoto && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" />
                {meta.sourcePhotoLabel}
                <span className="text-destructive">*</span>
              </label>
              {existingPhotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto p-0.5">
                  {existingPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setSourcePhotoId(photo.id === sourcePhotoId ? null : photo.id)}
                      className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                        sourcePhotoId === photo.id
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                      data-testid={`source-photo-${photo.id}`}
                    >
                      <img
                        src={photo.imageUrl}
                        alt={photo.caption || "Property photo"}
                        className="w-full aspect-square object-cover"
                      />
                      {photo.isHero && (
                        <div className="absolute top-1 right-1 bg-accent-pop/90 rounded-full p-0.5">
                          <Star className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic rounded-md bg-muted/50 px-3 py-2">
                  No existing photos available — upload photos first to use this style.
                </p>
              )}
            </div>
          )}

          {!meta.promptOptional && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Image Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want..."
                rows={3}
                className="resize-none"
                data-testid="input-image-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Auto-generated from property details — edit for custom results.
              </p>
            </div>
          )}

          {meta.promptOptional && selectedStyle !== "background-remove" && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                Enhancement Prompt
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Additional guidance for enhancement..."
                rows={2}
                className="resize-none"
                data-testid="input-image-prompt"
              />
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isDisabled}
            className="w-full"
            data-testid="button-generate-image"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{generationStatus || "Generating..."}</>
            ) : (
              <>
                {selectedStyle === "photo-upscale" ? <ArrowUp className="w-4 h-4 mr-2" /> :
                 selectedStyle === "background-remove" ? <Crop className="w-4 h-4 mr-2" /> :
                 selectedStyle === "virtual-staging" ? <Images className="w-4 h-4 mr-2" /> :
                 <Sparkles className="w-4 h-4 mr-2" />}
                {selectedStyle === "photo-upscale" ? "Upscale Photo" :
                 selectedStyle === "background-remove" ? "Remove Background" :
                 "Generate Image"}
              </>
            )}
          </Button>

          {sourcePhotoMissing && existingPhotos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Upload at least one photo to use this style.
            </p>
          )}

          {isGenerating && selectedStyle !== "standard" && (
            <div className="space-y-2" data-testid="status-generation-progress">
              <Progress value={undefined} className="h-1.5" />
              <p className="text-xs text-center text-muted-foreground">
                {generationStatus || "Specialized models take 15–60 seconds..."}
              </p>
            </div>
          )}

          {fallbackNotice && (
            <div className="flex items-center gap-2 rounded-md bg-accent-pop/10 px-3 py-2 text-sm text-accent-pop" data-testid="status-fallback-notice">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {fallbackNotice}
            </div>
          )}

          {generatedUrl && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border">
                <img
                  src={generatedUrl}
                  alt="Generated preview"
                  className="w-full aspect-[16/10] object-cover bg-muted/30"
                  data-testid="img-generated-preview"
                />
                <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm text-white text-xs font-medium">
                  {STYLE_META[generatedStyle as GenerationStyle]?.label ?? "AI Generated"}
                </div>
              </div>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Caption (optional)"
                className="text-sm"
                data-testid="input-photo-caption"
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="set-hero"
                  checked={setAsHero}
                  onCheckedChange={(checked) => setSetAsHero(!!checked)}
                  data-testid="checkbox-set-hero"
                />
                <label htmlFor="set-hero" className="text-sm flex items-center gap-1.5 cursor-pointer">
                  <Star className="w-3.5 h-3.5 text-accent-pop" />
                  Set as hero image
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleGenerate} variant="outline" disabled={isGenerating} className="flex-1" data-testid="button-regenerate">
                  <Sparkles className="w-4 h-4 mr-2" />Regenerate
                </Button>
                <Button onClick={handleAddToAlbum} disabled={addPhoto.isPending} className="flex-1" data-testid="button-add-to-album">
                  <Plus className="w-4 h-4 mr-2" />Add to Album
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
