import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCrop as CropIcon } from "@/components/icons";

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  fileName: string;
  fileType: string;
  aspectRatio?: number;
  onCropComplete: (croppedFile: File) => void;
}

function getCenterCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

async function cropImageToFile(
  image: HTMLImageElement,
  crop: PixelCrop,
  fileName: string,
  fileType: string
): Promise<File> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const outputType = fileType === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputType === "image/jpeg" ? 0.92 : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Crop failed")); return; }
        const ext = outputType === "image/png" ? ".png" : ".jpg";
        const baseName = fileName.replace(/\.[^.]+$/, "");
        resolve(new File([blob], `${baseName}-cropped${ext}`, { type: outputType }));
      },
      outputType,
      quality
    );
  });
}

export function ImageCropDialog({
  open,
  onOpenChange,
  imageSrc,
  fileName,
  fileType,
  aspectRatio = 16 / 10,
  onCropComplete,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      setCrop(getCenterCrop(width, height, aspectRatio));
    },
    [aspectRatio]
  );

  const handleSave = async () => {
    if (!imgRef.current || !completedCrop) return;
    setIsCropping(true);
    try {
      const croppedFile = await cropImageToFile(imgRef.current, completedCrop, fileName, fileType);
      onCropComplete(croppedFile);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Image cropping failed:", error);
    } finally {
      setIsCropping(false);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
    onCropComplete(new File([], ""));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="image-crop-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="w-5 h-5 text-primary" />
            Crop Image
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center max-h-[60vh] overflow-hidden rounded-lg bg-muted">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspectRatio}
            className="max-h-[60vh]"
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              style={{ maxHeight: "60vh", maxWidth: "100%" }}
              crossOrigin="anonymous"
            />
          </ReactCrop>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Drag to adjust the crop area. The image will be cropped to fit the property card.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleSkip} disabled={isCropping} data-testid="crop-skip">
            Upload Original
          </Button>
          <Button onClick={handleSave} disabled={isCropping || !completedCrop} data-testid="crop-save">
            {isCropping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Cropping...
              </>
            ) : (
              <>
                <CropIcon className="w-4 h-4 mr-2" />
                Crop & Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
