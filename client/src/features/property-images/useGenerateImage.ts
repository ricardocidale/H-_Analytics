import { useState, useCallback } from "react";

export type GenerationStyle =
  | "standard"
  | "architectural-exterior"
  | "interior-design"
  | "renovation-concept"
  | "photo-upscale"
  | "virtual-staging"
  | "background-remove"
  | "photo-to-render";

interface GenerateImageResult {
  objectPath: string;
  imageData?: string;
  style: string;
  usedFallback: boolean;
  fallbackNotice?: string;
}

interface UseGenerateImageOptions {
  onSuccess?: (objectPath: string, result: GenerateImageResult) => void;
  onError?: (error: Error) => void;
}

export function useGenerateImage(options: UseGenerateImageOptions = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);

  const generateImage = useCallback(
    async (
      prompt: string,
      style: GenerationStyle = "standard",
      beforeImageUrl?: string
    ): Promise<GenerateImageResult | null> => {
      setIsGenerating(true);
      setError(null);
      setGenerationStatus(
        style !== "standard"
          ? "Submitting to specialized renderer..."
          : "Generating image..."
      );

      try {
        const res = await fetch("/api/generate-property-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, style, beforeImageUrl }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({} as Record<string, string>));
          throw new Error(data.error || "Failed to generate image");
        }

        const data: GenerateImageResult = await res.json();
        setGenerationStatus(null);
        options.onSuccess?.(data.objectPath, data);
        return data;
      } catch (err: unknown) {
        const error =
          err instanceof Error ? err : new Error("Image generation failed");
        setError(error);
        setGenerationStatus(null);
        options.onError?.(error);
        return null;
      } finally {
        setIsGenerating(false);
        setGenerationStatus(null);
      }
    },
    [options],
  );

  return { generateImage, isGenerating, error, generationStatus };
}
