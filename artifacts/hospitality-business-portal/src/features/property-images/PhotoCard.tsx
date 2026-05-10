import { useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Star, Trash2, GripVertical, Pencil, Check, X, Sparkles, Download } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { PropertyPhoto } from "@shared/schema";

interface DragHandleProps {
  attributes?: HTMLAttributes<HTMLButtonElement>;
  listeners?: DraggableSyntheticListeners;
  isDragging?: boolean;
  style?: CSSProperties;
}

interface PhotoCardProps {
  photo: PropertyPhoto;
  onSetHero: (photoId: number) => void;
  onDelete: (photoId: number) => void;
  onUpdateCaption: (photoId: number, caption: string) => void;
  onEnhance?: (photoId: number) => void;
  isSettingHero?: boolean;
  isDeleting?: boolean;
  isEnhancing?: boolean;
  readOnly?: boolean;
  dragHandle?: DragHandleProps;
}

export function PhotoCard({ photo, onSetHero, onDelete, onUpdateCaption, onEnhance, isSettingHero, isDeleting, isEnhancing, readOnly = false, dragHandle }: PhotoCardProps) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(photo.caption || "");

  const handleSaveCaption = () => {
    onUpdateCaption(photo.id, captionDraft);
    setEditingCaption(false);
  };

  const handleDownload = async (enhanced?: boolean) => {
    const url = enhanced
      ? `/api/property-photos/${photo.id}/enhanced-image`
      : (photo.imageData ? `/api/property-photos/${photo.id}/image` : photo.imageUrl);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const suffix = enhanced ? "-enhanced" : "";
    const name = (photo.caption || `photo-${photo.id}`)
      .replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "-");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}${suffix}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <motion.div
      layout
      className={cn(
        "relative group overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md",
        photo.isHero && "ring-2 ring-accent-pop/60"
      )}
      data-testid={`photo-card-${photo.id}`}
    >
      {/* Drag handle — admin only */}
      {!readOnly && dragHandle && (
        <button
          type="button"
          aria-label="Drag to reorder photo"
          data-testid={`drag-handle-photo-${photo.id}`}
          {...(dragHandle.attributes ?? {})}
          {...(dragHandle.listeners ?? {})}
          className={cn(
            "absolute top-2 right-12 z-10 p-1 rounded bg-black/50 backdrop-blur-sm transition-opacity touch-none focus:outline-none focus:ring-2 focus:ring-white/60",
            dragHandle.isDragging
              ? "opacity-100 cursor-grabbing"
              : "opacity-0 group-hover:opacity-100 cursor-grab"
          )}
        >
          <GripVertical className="w-4 h-4 text-white" />
        </button>
      )}

      {/* Hero star */}
      {(photo.isHero || !readOnly) && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => !photo.isHero && !readOnly && onSetHero(photo.id)}
          disabled={isSettingHero || readOnly}
          className={cn(
            "absolute top-2 right-2 z-10 p-1.5 rounded-full h-auto w-auto",
            photo.isHero
              ? "bg-accent-pop/80 text-accent-pop shadow-lg shadow-accent-pop/30"
              : "bg-black/50 backdrop-blur-sm text-white/70 opacity-0 group-hover:opacity-100 hover:bg-accent-pop/80 hover:text-accent-pop"
          )}
          title={photo.isHero ? "Current hero image" : "Set as hero image"}
          aria-label={photo.isHero ? "Current hero image" : "Set as hero image"}
        >
          <Star className={cn("w-4 h-4", photo.isHero && "fill-current")} />
        </Button>
      )}

      {photo.enhancedImageData && (
        <div className="absolute top-2 left-10 z-10">
          <span className="px-1.5 py-0.5 rounded-full bg-primary/80 text-white text-[9px] font-medium backdrop-blur-sm" data-testid={`badge-enhanced-${photo.id}`}>
            Enhanced
          </span>
        </div>
      )}

      {photo.isHero && onEnhance && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEnhance(photo.id)}
          disabled={isEnhancing}
          className="absolute top-10 right-2 z-10 p-1.5 rounded-full h-auto w-auto bg-black/50 backdrop-blur-sm text-white/70 opacity-0 group-hover:opacity-100 hover:bg-primary/80 hover:text-white transition-all"
          title={photo.enhancedImageData ? "Re-enhance photo" : "Enhance with AI"}
          aria-label={photo.enhancedImageData ? "Re-enhance photo" : "Enhance with AI"}
          data-testid={`button-enhance-${photo.id}`}
        >
          <Sparkles className={cn("w-4 h-4", isEnhancing && "animate-pulse")} />
        </Button>
      )}

      {/* Image */}
      <div className="aspect-[4/3] overflow-hidden">
        <picture>
          {photo.variants?.thumb && (
            <>
              <source
                srcSet={photo.variants.thumb.replace(/\.webp$/, ".avif")}
                type="image/avif"
              />
              <source
                srcSet={photo.variants.thumb}
                type="image/webp"
              />
            </>
          )}
          <img
            src={photo.variants?.thumb || photo.imageUrl}
            alt={photo.caption || "Property photo"}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            data-testid={`img-photo-${photo.id}`}
          />
        </picture>
      </div>

      {/* Caption + actions */}
      <div className="p-2.5">
        {editingCaption ? (
          <div className="space-y-1">
            {photo.isHero && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-accent-pop/10 text-accent-pop border border-accent-pop/20 cursor-default"
                    data-testid="badge-hero-caption-deck"
                  >
                    Used in deck
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px]">
                  <p className="text-xs">This caption appears as the location subtitle on Slide 3 of the investor deck</p>
                </TooltipContent>
              </Tooltip>
            )}
            <div className="flex items-center gap-1.5">
              <Input
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                className="h-7 text-xs"
                placeholder="Add caption..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveCaption()}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveCaption} aria-label="Save caption">
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingCaption(false)} aria-label="Cancel editing">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              {photo.isHero && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex self-start items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-accent-pop/10 text-accent-pop border border-accent-pop/20 cursor-default"
                      data-testid="badge-hero-caption-deck"
                    >
                      Used in deck
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">This caption appears as the location subtitle on Slide 3 of the investor deck</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {readOnly ? (
                <div className="text-left text-xs text-muted-foreground truncate h-auto px-0">
                  {photo.caption || ""}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => { setCaptionDraft(photo.caption || ""); setEditingCaption(true); }}
                  className="text-left text-xs text-muted-foreground hover:text-foreground truncate h-auto px-0 justify-start"
                  title="Click to edit caption"
                >
                  {photo.caption || "Add caption..."}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {!readOnly && (
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setCaptionDraft(photo.caption || ""); setEditingCaption(true); }} aria-label="Edit caption">
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDownload(false)} aria-label="Download photo" data-testid={`button-download-${photo.id}`}>
                    <Download className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p className="text-xs">Download original</p></TooltipContent>
              </Tooltip>
              {photo.enhancedImageData && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="relative h-6 w-6 text-primary/70 hover:text-primary" onClick={() => handleDownload(true)} aria-label="Download enhanced photo" data-testid={`button-download-enhanced-${photo.id}`}>
                      <Download className="w-3 h-3" />
                      <Sparkles className="w-1.5 h-1.5 absolute -bottom-0 -right-0" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p className="text-xs">Download AI enhanced</p></TooltipContent>
                </Tooltip>
              )}
              {!readOnly && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive/70 hover:text-destructive" aria-label="Delete photo" data-testid={`button-delete-${photo.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Photo</AlertDialogTitle>
                    <AlertDialogDescription>
                      This photo will be permanently removed from the album.
                      {photo.isHero && " Since this is the hero image, the next photo will become the new hero."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(photo.id)} disabled={isDeleting}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
