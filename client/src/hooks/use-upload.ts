import { useState, useCallback } from "react";

export const ALLOWED_IMAGE_TYPES = [
  "image/png", "image/jpeg", "image/jpg", "image/gif",
  "image/webp", "image/svg+xml", "image/bmp", "image/tiff",
];

export const ALLOWED_IMAGE_EXTENSIONS = ".png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.tiff";

export const ALLOWED_IMAGE_LABEL = "PNG, JPEG, GIF, WebP, SVG, BMP, or TIFF";

const MAX_FILE_SIZE_MB = 10;

interface UploadResponse {
  objectPath: string;
}

interface UseUploadOptions {
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported image format. Please upload ${ALLOWED_IMAGE_LABEL} files only.`;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum file size is ${MAX_FILE_SIZE_MB}MB.`;
  }
  return null;
}

export function useUpload(options: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      const validationError = validateImageFile(file);
      if (validationError) {
        const err = new Error(validationError);
        setError(err);
        options.onError?.(err);
        setIsUploading(false);
        return null;
      }

      try {
        setProgress(10);
        const arrayBuffer = await file.arrayBuffer();
        setProgress(30);

        const response = await fetch("/api/uploads/direct", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          credentials: "include",
          body: arrayBuffer,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({} as Record<string, string>));
          throw new Error(errorData.error || "Failed to upload file");
        }

        const data = await response.json();
        const uploadResponse: UploadResponse = { objectPath: data.objectPath };

        setProgress(100);
        options.onSuccess?.(uploadResponse);
        return uploadResponse;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Upload failed");
        setError(error);
        options.onError?.(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [options]
  );

  return {
    uploadFile,
    isUploading,
    error,
    progress,
  };
}
