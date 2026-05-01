import { useState, useRef, useCallback, useEffect } from "react";
import { Crop, ZoomIn, ZoomOut, Check } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  aspectRatio?: number;
  onCropComplete: (crop: CropRegion | null) => void;
}

export function ImageCropDialog({
  open,
  onOpenChange,
  imageSrc,
  aspectRatio = 4 / 3,
  onCropComplete,
}: ImageCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [cropBox, setCropBox] = useState<CropRegion>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const loadImage = useCallback(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);

      const cropW = Math.min(img.width, img.height * aspectRatio);
      const cropH = cropW / aspectRatio;
      setCropBox({
        x: (img.width - cropW) / 2,
        y: (img.height - cropH) / 2,
        width: cropW,
        height: cropH,
      });
    };
    img.src = imageSrc;
  }, [imageSrc, aspectRatio]);

  useEffect(() => {
    if (open && imageSrc) {
      setImageLoaded(false);
      loadImage();
    }
  }, [open, imageSrc, loadImage]);

  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imageRef.current;
    const displayW = 500;
    const scale = displayW / img.width;
    const displayH = img.height * scale;

    canvas.width = displayW;
    canvas.height = displayH;

    ctx.clearRect(0, 0, displayW, displayH);
    ctx.drawImage(img, 0, 0, displayW, displayH);

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, displayW, displayH);

    const sx = cropBox.x * scale;
    const sy = cropBox.y * scale;
    const sw = cropBox.width * scale;
    const sh = cropBox.height * scale;

    ctx.drawImage(
      img,
      cropBox.x, cropBox.y, cropBox.width, cropBox.height,
      sx, sy, sw, sh,
    );

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(sx + (sw * i) / 3, sy);
      ctx.lineTo(sx + (sw * i) / 3, sy + sh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy + (sh * i) / 3);
      ctx.lineTo(sx + sw, sy + (sh * i) / 3);
      ctx.stroke();
    }
  }, [imageLoaded, cropBox]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDragging(true);
    setDragStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !imageRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const img = imageRef.current;
    const scale = 500 / img.width;

    const dx = (e.clientX - rect.left - dragStart.x) / scale;
    const dy = (e.clientY - rect.top - dragStart.y) / scale;

    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    setCropBox((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(img.width - prev.width, prev.x + dx)),
      y: Math.max(0, Math.min(img.height - prev.height, prev.y + dy)),
    }));
  };

  const handleMouseUp = () => setDragging(false);

  const handleZoom = (newZoom: number) => {
    if (!imageRef.current) return;
    const img = imageRef.current;
    const zoomFactor = newZoom / zoom;
    setZoom(newZoom);

    setCropBox((prev) => {
      const centerX = prev.x + prev.width / 2;
      const centerY = prev.y + prev.height / 2;
      const newW = Math.min(img.width, prev.width / zoomFactor);
      const newH = newW / aspectRatio;
      return {
        x: Math.max(0, Math.min(img.width - newW, centerX - newW / 2)),
        y: Math.max(0, Math.min(img.height - newH, centerY - newH / 2)),
        width: newW,
        height: newH,
      };
    });
  };

  const handleConfirm = () => {
    onCropComplete({
      x: Math.round(cropBox.x),
      y: Math.round(cropBox.y),
      width: Math.round(cropBox.width),
      height: Math.round(cropBox.height),
    });
    onOpenChange(false);
  };

  const handleSkip = () => {
    onCropComplete(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-5 h-5 text-primary" />
            Adjust Crop
          </DialogTitle>
          <DialogDescription>
            Drag to reposition the crop area. The image will be automatically optimized.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {imageLoaded ? (
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="rounded-lg cursor-move max-w-full border"
              style={{ maxHeight: "350px" }}
              data-testid="crop-canvas"
            />
          ) : (
            <div className="w-[500px] h-[350px] bg-muted animate-pulse rounded-lg" />
          )}

          <div className="flex items-center gap-3 w-full px-4">
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
            <input
              type="range"
              value={zoom}
              min={0.5}
              max={3}
              step={0.1}
              onChange={(e) => handleZoom(parseFloat(e.target.value))}
              className="flex-1 accent-primary"
              data-testid="crop-zoom-slider"
            />
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleSkip} data-testid="button-skip-crop">
            Skip Crop
          </Button>
          <Button onClick={handleConfirm} data-testid="button-confirm-crop">
            <Check className="w-4 h-4 mr-2" />
            Apply Crop
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
