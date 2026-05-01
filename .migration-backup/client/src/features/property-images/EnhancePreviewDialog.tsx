import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "@/components/icons/themed-icons";

interface EnhancePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalSrc: string;
  enhancedSrc: string | null;
  isEnhancing: boolean;
  onAccept: () => void;
  onReject: () => void;
  photoCaption?: string;
}

export function EnhancePreviewDialog({
  open,
  onOpenChange,
  originalSrc,
  enhancedSrc,
  isEnhancing,
  onAccept,
  onReject,
  photoCaption,
}: EnhancePreviewDialogProps) {
  const [viewMode, setViewMode] = useState<"side-by-side" | "slider">("side-by-side");
  const [sliderPos, setSliderPos] = useState(50);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="dialog-enhance-preview">
        <DialogHeader>
          <DialogTitle className="font-display">AI Photo Enhancement</DialogTitle>
          <DialogDescription>
            {isEnhancing
              ? "Enhancing your photo with AI — this may take 30–60 seconds..."
              : "Compare the original and enhanced versions. Accept to use the enhanced image."}
          </DialogDescription>
        </DialogHeader>

        {isEnhancing ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="enhance-loading">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <div className="absolute -inset-2 rounded-full border-2 border-primary/20 animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Processing with AI clarity upscaler...</p>
          </div>
        ) : enhancedSrc ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant={viewMode === "side-by-side" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewMode("side-by-side")}
                data-testid="button-view-side-by-side"
              >
                Side by Side
              </Button>
              <Button
                variant={viewMode === "slider" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setViewMode("slider")}
                data-testid="button-view-slider"
              >
                Slider Compare
              </Button>
            </div>

            {viewMode === "side-by-side" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Original</p>
                  <div className="aspect-[16/10] overflow-hidden rounded-lg border border-border">
                    <img
                      src={originalSrc}
                      alt={photoCaption || "Original"}
                      className="w-full h-full object-cover"
                      data-testid="img-enhance-original"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Enhanced
                  </p>
                  <div className="aspect-[16/10] overflow-hidden rounded-lg border border-primary/30">
                    <img
                      src={enhancedSrc}
                      alt={photoCaption ? `${photoCaption} (enhanced)` : "Enhanced"}
                      className="w-full h-full object-cover"
                      data-testid="img-enhance-enhanced"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border" data-testid="slider-compare">
                <img
                  src={enhancedSrc}
                  alt="Enhanced"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${sliderPos}%` }}
                >
                  <img
                    src={originalSrc}
                    alt="Original"
                    className="w-full h-full object-cover"
                    style={{ width: `${10000 / sliderPos}%`, maxWidth: "none" }}
                  />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-col-resize z-10"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                    <div className="flex gap-0.5">
                      <div className="w-0.5 h-3 bg-muted-foreground/60 rounded-full" />
                      <div className="w-0.5 h-3 bg-muted-foreground/60 rounded-full" />
                    </div>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={sliderPos}
                  onChange={(e) => setSliderPos(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-col-resize z-20"
                  data-testid="input-slider-compare"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">
                  Original
                </div>
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-primary/80 text-white text-[10px] font-medium">
                  Enhanced
                </div>
              </div>
            )}
          </>
        ) : null}

        {!isEnhancing && enhancedSrc && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onReject} data-testid="button-reject-enhance">
              <X className="w-4 h-4 mr-1.5" />
              Reject
            </Button>
            <Button onClick={onAccept} data-testid="button-accept-enhance">
              <Check className="w-4 h-4 mr-1.5" />
              Accept Enhanced
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
