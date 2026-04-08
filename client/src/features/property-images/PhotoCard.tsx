import { useState } from "react";
import { motion } from "framer-motion";
import { Star, Trash2, GripVertical, Pencil, Check, X, Sparkles } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { PropertyPhoto } from "@shared/schema";

interface PhotoCardProps {
  photo: PropertyPhoto;
  onSetHero: (photoId: number) => void;
  onDelete: (photoId: number) => void;
  onUpdateCaption: (photoId: number, caption: string) => void;
  onEnhance?: (photoId: number) => void;
  isSettingHero?: boolean;
  isDeleting?: boolean;
  isEnhancing?: boolean;
}

export function PhotoCard({ photo, onSetHero, onDelete, onUpdateCaption, onEnhance, isSettingHero, isDeleting, isEnhancing }: PhotoCardProps) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(photo.caption || "");

  const handleSaveCaption = () => {
    onUpdateCaption(photo.id, captionDraft);
    setEditingCaption(false);
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
      {/* Drag handle */}
      <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
        <div className="p-1 rounded bg-black/50 backdrop-blur-sm">
          <GripVertical className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Hero star */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => !photo.isHero && onSetHero(photo.id)}
        disabled={isSettingHero}
        className={cn(
          "absolute top-2 right-2 z-10 p-1.5 rounded-full h-auto w-auto",
          photo.isHero
            ? "bg-accent-pop/80 text-accent-pop shadow-lg shadow-accent-pop/30"
            : "bg-black/50 backdrop-blur-sm text-white/70 opacity-0 group-hover:opacity-100 hover:bg-accent-pop/80 hover:text-accent-pop"
        )}
        title={photo.isHero ? "Current hero image" : "Set as hero image"}
      >
        <Star className={cn("w-4 h-4", photo.isHero && "fill-current")} />
      </Button>

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
          <div className="flex items-center gap-1.5">
            <Input
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              className="h-7 text-xs"
              placeholder="Add caption..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSaveCaption()}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveCaption}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingCaption(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => { setCaptionDraft(photo.caption || ""); setEditingCaption(true); }}
              className="flex-1 text-left text-xs text-muted-foreground hover:text-foreground truncate h-auto px-0 justify-start"
              title="Click to edit caption"
            >
              {photo.caption || "Add caption..."}
            </Button>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setCaptionDraft(photo.caption || ""); setEditingCaption(true); }}>
                <Pencil className="w-3 h-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive/70 hover:text-destructive">
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
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
