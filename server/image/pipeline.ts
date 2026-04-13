import sharp from "sharp";
import { IMAGE_VARIANTS, buildVariantPath, buildOriginalPath, type ImageVariants, type VariantSpec } from "./variants";
import { getStorageProvider } from "../providers/storage";
import { logger } from "../logger";

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ProcessImageOptions {
  propertyId: number;
  photoId: number;
  crop?: CropRegion;
}

export interface ProcessedImageResult {
  variants: ImageVariants;
  width: number;
  height: number;
  format: string;
}

function getOriginalExtension(contentType?: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/tiff": "tiff",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return map[contentType || ""] || "jpg";
}

function hasTransparency(metadata: sharp.Metadata): boolean {
  return metadata.hasAlpha === true && (metadata.format === "png" || metadata.format === "webp");
}

async function uploadToObjectStorage(
  buffer: Buffer,
  path: string,
  contentType: string,
): Promise<string> {
  const storageProvider = getStorageProvider();
  return storageProvider.uploadBuffer(path, buffer, contentType);
}

async function generateVariant(
  pipeline: sharp.Sharp,
  spec: VariantSpec,
  isTransparent: boolean,
): Promise<{ webpBuffer: Buffer; avifBuffer: Buffer | null }> {
  const resizeOptions: sharp.ResizeOptions = {
    width: spec.width,
    height: spec.height || undefined,
    fit: spec.fit as keyof sharp.FitEnum,
    position: sharp.strategy.attention,
    withoutEnlargement: true,
  };

  const resized = pipeline.clone().resize(resizeOptions);

  let webpBuffer: Buffer;
  if (isTransparent) {
    webpBuffer = await resized.clone().webp({ quality: spec.quality, lossless: false }).toBuffer();
  } else {
    webpBuffer = await resized.clone().webp({ quality: spec.quality }).toBuffer();
  }

  let avifBuffer: Buffer | null = null;
  try {
    avifBuffer = await resized.clone().avif({ quality: spec.quality }).toBuffer();
  } catch {
    avifBuffer = null;
  }

  return { webpBuffer, avifBuffer };
}

export async function processImage(
  inputBuffer: Buffer,
  options: ProcessImageOptions,
  contentType?: string,
): Promise<ProcessedImageResult> {
  const { propertyId, photoId, crop } = options;

  let pipeline = sharp(inputBuffer, { failOn: "none" }).rotate();

  const metadata = await pipeline.metadata();
  const isTransparent = hasTransparency(metadata);

  if (crop) {
    pipeline = pipeline.extract({
      left: Math.round(crop.left),
      top: Math.round(crop.top),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    });
  }

  const originalExt = getOriginalExtension(contentType);
  const originalPath = buildOriginalPath(propertyId, photoId, originalExt);
  const originalObjectPath = await uploadToObjectStorage(inputBuffer, originalPath, contentType || "image/jpeg");

  const variants: ImageVariants = {
    original: originalObjectPath,
  };

  for (const spec of IMAGE_VARIANTS) {
    const { webpBuffer, avifBuffer } = await generateVariant(pipeline, spec, isTransparent);

    const webpPath = buildVariantPath(propertyId, photoId, spec.name, "webp");
    const webpObjectPath = await uploadToObjectStorage(webpBuffer, webpPath, "image/webp");
    (variants as Record<string, string>)[spec.name] = webpObjectPath;

    if (avifBuffer) {
      const avifPath = buildVariantPath(propertyId, photoId, spec.name, "avif");
      await uploadToObjectStorage(avifBuffer, avifPath, "image/avif");
    }
  }

  let finalWidth = metadata.width || 0;
  let finalHeight = metadata.height || 0;
  if (crop) {
    finalWidth = Math.round(crop.width);
    finalHeight = Math.round(crop.height);
  }

  return {
    variants,
    width: finalWidth,
    height: finalHeight,
    format: metadata.format || "unknown",
  };
}

export async function processExistingPhoto(
  imageUrl: string,
  propertyId: number,
  photoId: number,
): Promise<ProcessedImageResult | null> {
  try {
    let buffer: Buffer;
    let contentType = "image/jpeg";

    if (imageUrl.startsWith("/objects/")) {
      const storageProvider = getStorageProvider();
      const downloaded = await storageProvider.downloadBuffer(imageUrl);
      buffer = downloaded.buffer;
      contentType = downloaded.contentType || "image/jpeg";
    } else if (imageUrl.startsWith("http")) {
      const response = await fetch(imageUrl);
      if (!response.ok) return null;
      buffer = Buffer.from(await response.arrayBuffer());
      contentType = response.headers.get("content-type") || "image/jpeg";
    } else {
      return null;
    }

    return await processImage(buffer, { propertyId, photoId }, contentType);
  } catch (error: unknown) {
    logger.error(`Failed to process existing photo ${photoId}: ${error instanceof Error ? error.message : error}`, "image-pipeline");
    return null;
  }
}
