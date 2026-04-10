/**
 * PropertyPhotoUpload.tsx — Image upload button for property hero photos.
 *
 * Allows the user to replace a property's hero image by selecting a local
 * file. The upload flow is:
 *   1. User clicks the "Change Photo" overlay button
 *   2. A hidden <input type="file"> triggers the OS file picker
 *   3. The selected image is uploaded to object storage via `useUpload`
 *   4. On success, the property record is patched with the new imageUrl
 *
 * Validates that the file is an image and under 10 MB before uploading.
 */
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCamera } from "@/components/icons";
import { useUpload } from "@/hooks/use-upload";
import { useUpdateProperty } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PropertyPhotoUploadProps {
  propertyId: number;
  currentImageUrl: string;
  onUploadComplete?: (newImageUrl: string) => void;
}

export function PropertyPhotoUpload({ propertyId, currentImageUrl, onUploadComplete }: PropertyPhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const updateProperty = useUpdateProperty();
  const [isUploading, setIsUploading] = useState(false);

  const { uploadFile } = useUpload({
    onSuccess: async (response) => {
      try {
        const imageUrl = response.objectPath;
        await updateProperty.mutateAsync({
          id: propertyId,
          data: { imageUrl }
        });
        toast({
          title: "Photo Updated",
          description: "Property photo has been successfully updated.",
        });
        onUploadComplete?.(imageUrl);
      } catch (error: unknown) {
        console.error("Failed to update property with new image:", error);
        toast({
          title: "Update Failed",
          description: "Failed to save the new photo. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    onError: (error) => {
      console.error("Upload failed:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload photo. Please try again.",
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please select an image file (JPEG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image under 10MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    await uploadFile(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        data-testid="input-property-photo"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isUploading}
        className="absolute top-4 right-4 bg-card hover:bg-muted border-border shadow-sm"
        data-testid="button-change-photo"
      >
        {isUploading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <IconCamera className="w-4 h-4 mr-2" />
            Change Photo
          </>
        )}
      </Button>
    </>
  );
}
