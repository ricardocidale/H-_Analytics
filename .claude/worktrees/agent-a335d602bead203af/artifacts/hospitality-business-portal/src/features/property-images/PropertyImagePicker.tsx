import { AIImagePicker } from "@/components/ui/ai-image-picker";

interface PropertyImagePickerProps {
  imageUrl: string;
  onImageChange: (url: string) => void;
  propertyName?: string;
  location?: string;
  variant?: "dark" | "light";
}

export function PropertyImagePicker({
  imageUrl,
  onImageChange,
  propertyName,
  location,
  variant = "dark",
}: PropertyImagePickerProps) {
  const autoPrompt = buildAutoPrompt(propertyName, location);

  return (
    <AIImagePicker
      imageUrl={imageUrl}
      onImageChange={onImageChange}
      defaultPrompt={autoPrompt}
      promptPlaceholder={autoPrompt || "Describe the property photo you want..."}
      uploadLabel="Upload Photo"
      generateLabel="Generate with AI"
      variant={variant}
      aspectRatio="landscape"
      maxSizeMB={10}
      context={autoPrompt ? `Auto-prompt: "${autoPrompt}"` : undefined}
      data-testid="property-image-picker"
    />
  );
}

function buildAutoPrompt(propertyName?: string, location?: string): string {
  if (!propertyName && !location) return "";
  const parts = [
    "Luxury boutique hotel exterior",
    propertyName,
    location,
    "architectural photography, golden hour lighting",
  ].filter(Boolean);
  return parts.join(", ");
}
