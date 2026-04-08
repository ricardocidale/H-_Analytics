import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, Sparkles, Images } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { usePropertyPhotos, useSetHeroPhoto, useDeletePropertyPhoto, useUpdatePropertyPhoto, useReorderPhotos, useEnhancePhoto, useAcceptEnhancement, useRejectEnhancement } from "@/lib/api";
import { PhotoCard } from "./PhotoCard";
import { PhotoUploadDialog } from "./PhotoUploadDialog";
import { PhotoGenerateDialog } from "./PhotoGenerateDialog";
import { EnhancePreviewDialog } from "./EnhancePreviewDialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface PhotoAlbumGridProps {
  propertyId: number;
  propertyName?: string;
  location?: string;
  roomCount?: number;
  propertyType?: string;
  className?: string;
}

export function PhotoAlbumGrid({
  propertyId,
  propertyName,
  location,
  roomCount,
  propertyType,
  className,
}: PhotoAlbumGridProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false);
  const [enhancingPhotoId, setEnhancingPhotoId] = useState<number | null>(null);
  const [enhancedPreviewUrl, setEnhancedPreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: photos = [], isLoading } = usePropertyPhotos(propertyId);
  const setHero = useSetHeroPhoto();
  const deletePhoto = useDeletePropertyPhoto();
  const updatePhoto = useUpdatePropertyPhoto();
  const reorder = useReorderPhotos();
  const enhancePhoto = useEnhancePhoto();
  const acceptEnhancement = useAcceptEnhancement();
  const rejectEnhancement = useRejectEnhancement();

  const handleSetHero = (photoId: number) => {
    setHero.mutate({ propertyId, photoId });
  };

  const handleDelete = (photoId: number) => {
    deletePhoto.mutate({ propertyId, photoId });
  };

  const handleUpdateCaption = (photoId: number, caption: string) => {
    updatePhoto.mutate({ propertyId, photoId, data: { caption } });
  };

  const handleEnhance = (photoId: number) => {
    setEnhancingPhotoId(photoId);
    setEnhancedPreviewUrl(null);
    setEnhanceDialogOpen(true);
    enhancePhoto.mutate(
      { photoId, propertyId },
      {
        onSuccess: (data) => {
          setEnhancedPreviewUrl(data.previewUrl);
        },
        onError: (error) => {
          setEnhanceDialogOpen(false);
          setEnhancingPhotoId(null);
          toast({
            title: "Enhancement failed",
            description: error instanceof Error ? error.message : "An error occurred during enhancement",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleAcceptEnhance = () => {
    if (enhancingPhotoId) {
      acceptEnhancement.mutate(
        { photoId: enhancingPhotoId, propertyId },
        {
          onSuccess: () => {
            toast({ title: "Enhancement accepted", description: "The enhanced image is now active with regenerated variants." });
          },
          onError: () => {
            toast({ title: "Accept failed", description: "Could not persist enhancement. Try again.", variant: "destructive" });
          },
        }
      );
    }
    setEnhanceDialogOpen(false);
    setEnhancingPhotoId(null);
    setEnhancedPreviewUrl(null);
  };

  const handleRejectEnhance = () => {
    if (enhancingPhotoId) {
      rejectEnhancement.mutate({ photoId: enhancingPhotoId, propertyId });
    }
    setEnhanceDialogOpen(false);
    setEnhancingPhotoId(null);
    setEnhancedPreviewUrl(null);
    toast({ title: "Enhancement rejected", description: "Reverted to the original image." });
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-[4/3] bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Images className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Photo Album</h3>
          <span className="text-xs text-muted-foreground">({photos.length})</span>
          <InfoTooltip text="Manage multiple photos for this property. Mark one as the hero image — it will represent the property on portfolio cards, detail pages, and exports." />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="w-3.5 h-3.5" />
            Generate
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setUploadOpen(true)}>
            <ImagePlus className="w-3.5 h-3.5" />
            Upload
          </Button>
        </div>
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="border-2 border-dashed border-primary/20 rounded-lg p-8 text-center">
          <Images className="w-10 h-10 mx-auto text-primary/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No photos yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Upload photos or generate them with AI</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
              <ImagePlus className="w-4 h-4 mr-1.5" />Upload
            </Button>
            <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="w-4 h-4 mr-1.5" />Generate
            </Button>
          </div>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 gap-3"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          <AnimatePresence mode="popLayout">
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <PhotoCard
                  photo={photo}
                  onSetHero={handleSetHero}
                  onDelete={handleDelete}
                  onUpdateCaption={handleUpdateCaption}
                  onEnhance={handleEnhance}
                  isSettingHero={setHero.isPending}
                  isDeleting={deletePhoto.isPending}
                  isEnhancing={enhancePhoto.isPending && enhancingPhotoId === photo.id}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Hero indicator */}
      {photos.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-accent-pop/80" />
          Gold star = hero image shown on portfolio cards and headers
          <InfoTooltip text="The hero photo represents this property across the platform — portfolio cards, property header, and exported reports." />
        </p>
      )}

      {/* Dialogs */}
      <EnhancePreviewDialog
        open={enhanceDialogOpen}
        onOpenChange={(open) => {
          if (!open && !enhancePhoto.isPending) {
            if (enhancingPhotoId && enhancedPreviewUrl) {
              rejectEnhancement.mutate({ photoId: enhancingPhotoId, propertyId });
            }
            setEnhanceDialogOpen(false);
            setEnhancingPhotoId(null);
            setEnhancedPreviewUrl(null);
          }
        }}
        originalSrc={enhancingPhotoId ? (photos.find(p => p.id === enhancingPhotoId)?.imageUrl || "") : ""}
        enhancedSrc={enhancedPreviewUrl}
        isEnhancing={enhancePhoto.isPending}
        onAccept={handleAcceptEnhance}
        onReject={handleRejectEnhance}
        photoCaption={enhancingPhotoId ? (photos.find(p => p.id === enhancingPhotoId)?.caption || undefined) : undefined}
      />
      <PhotoUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} propertyId={propertyId} />
      <PhotoGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        propertyId={propertyId}
        propertyName={propertyName}
        location={location}
        roomCount={roomCount}
        propertyType={propertyType}
        existingPhotos={photos}
      />
    </div>
  );
}
