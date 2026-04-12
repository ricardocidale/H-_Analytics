import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImagePlus, Sparkles, Images } from "@/components/icons/themed-icons";
import { LayoutGrid, GalleryHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi } from "@/components/ui/carousel";
import { usePropertyPhotos, useSetHeroPhoto, useDeletePropertyPhoto, useUpdatePropertyPhoto, useEnhancePhoto, useAcceptEnhancement, useRejectEnhancement } from "@/lib/api";
import { PhotoCard } from "./PhotoCard";
import { PhotoUploadDialog } from "./PhotoUploadDialog";
import { PhotoGenerateDialog } from "./PhotoGenerateDialog";
import { EnhancePreviewDialog } from "./EnhancePreviewDialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type ViewMode = "grid" | "carousel";

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
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const { toast } = useToast();

  const { data: photos = [], isLoading } = usePropertyPhotos(propertyId);
  const setHero = useSetHeroPhoto();
  const deletePhoto = useDeletePropertyPhoto();
  const updatePhoto = useUpdatePropertyPhoto();
  const enhancePhoto = useEnhancePhoto();
  const acceptEnhancement = useAcceptEnhancement();
  const rejectEnhancement = useRejectEnhancement();

  const onCarouselSelect = useCallback(() => {
    if (!carouselApi) return;
    setCurrentSlide(carouselApi.selectedScrollSnap());
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi) return;
    onCarouselSelect();
    carouselApi.on("select", onCarouselSelect);
    return () => { carouselApi.off("select", onCarouselSelect); };
  }, [carouselApi, onCarouselSelect]);

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
          {/* View mode toggle — only shown when there are photos */}
          {photos.length > 0 && (
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
                aria-label="Grid view"
                className={cn(
                  "h-7 px-2 flex items-center justify-center transition-colors",
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("carousel")}
                data-testid="button-view-carousel"
                aria-label="Carousel view"
                className={cn(
                  "h-7 px-2 flex items-center justify-center transition-colors border-l border-border",
                  viewMode === "carousel"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <GalleryHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setGenerateOpen(true)} data-testid="button-generate-photo">
            <Sparkles className="w-3.5 h-3.5" />
            Generate
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setUploadOpen(true)} data-testid="button-upload-photo">
            <ImagePlus className="w-3.5 h-3.5" />
            Upload
          </Button>
        </div>
      </div>

      {/* Empty state */}
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
      ) : viewMode === "carousel" ? (
        /* ── Carousel view ── */
        <div className="space-y-3">
          <div className="relative px-10">
            <Carousel
              setApi={setCarouselApi}
              opts={{ loop: true, align: "center" }}
              className="w-full"
              data-testid="photo-carousel"
            >
              <CarouselContent>
                {photos.map((photo) => {
                  const src = photo.enhancedImageData
                    ? `/api/property-photos/${photo.id}/enhanced-image`
                    : photo.imageUrl;
                  const isHero = photo.isHero;
                  return (
                    <CarouselItem key={photo.id}>
                      <div className="relative rounded-xl overflow-hidden shadow-md" style={{ aspectRatio: "16 / 9" }}>
                        <img
                          src={src}
                          alt={photo.caption || `Photo ${photo.id}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {/* Gradient overlay */}
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

                        {/* Hero badge */}
                        {isHero && (
                          <div className="absolute top-3 left-3">
                            <span className="px-2 py-0.5 rounded-full bg-accent-pop text-white text-[10px] font-semibold border border-white/20 shadow-sm">
                              ★ Hero
                            </span>
                          </div>
                        )}

                        {/* Enhanced badge */}
                        {photo.enhancedImageData && (
                          <div className="absolute top-3 right-3">
                            <span className="px-2 py-0.5 rounded-full bg-primary/80 text-white text-[10px] font-semibold backdrop-blur-sm border border-white/20">
                              Enhanced
                            </span>
                          </div>
                        )}

                        {/* Caption */}
                        {photo.caption && (
                          <div className="absolute bottom-3 inset-x-4 pointer-events-none">
                            <p className="text-white text-sm font-medium drop-shadow-md italic truncate">
                              {photo.caption}
                            </p>
                          </div>
                        )}
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <CarouselPrevious
                className="left-0 bg-background/90 backdrop-blur-sm border-border hover:bg-background shadow-md"
                data-testid="button-carousel-prev"
              />
              <CarouselNext
                className="right-0 bg-background/90 backdrop-blur-sm border-border hover:bg-background shadow-md"
                data-testid="button-carousel-next"
              />
            </Carousel>
          </div>

          {/* Slide counter + dots */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {currentSlide + 1} of {photos.length}
            </span>
            <div className="flex gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => carouselApi?.scrollTo(i)}
                  aria-label={`Go to photo ${i + 1}`}
                  className={cn(
                    "rounded-full transition-all duration-300 bg-primary",
                    i === currentSlide ? "w-5 h-1.5" : "w-1.5 h-1.5 opacity-30"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Thumbnail strip */}
          <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
            {photos.map((photo, i) => {
              const src = photo.enhancedImageData
                ? `/api/property-photos/${photo.id}/enhanced-image`
                : photo.imageUrl;
              return (
                <button
                  key={photo.id}
                  onClick={() => carouselApi?.scrollTo(i)}
                  aria-label={`Thumbnail ${i + 1}`}
                  data-testid={`thumbnail-${photo.id}`}
                  className={cn(
                    "shrink-0 rounded-md overflow-hidden border-2 transition-all snap-start",
                    i === currentSlide
                      ? "border-primary shadow-sm scale-105"
                      : "border-transparent opacity-60 hover:opacity-90"
                  )}
                  style={{ width: 64, height: 48 }}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Grid view (default) ── */
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

      {/* Hero indicator — only show in grid mode */}
      {photos.length > 0 && viewMode === "grid" && (
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
