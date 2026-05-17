import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconImage, IconAlertTriangle } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AppBranding {
  appName: string;
  appLogoUrl: string | null;
  appLogoId: number | null;
}

export default function AppLogoTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: branding, isLoading, isError } = useQuery<AppBranding>({
    queryKey: ["/api/app-branding"],
  });

  const { uploadFile, isUploading } = useUpload({
    onSuccess: async (response) => {
      try {
        setIsSaving(true);
        const logo = await apiRequest("POST", "/api/logos", {
          url: response.objectPath,
          name: "App Logo",
          companyName: branding?.appName ?? "H+ Analytics",
        }) as unknown as { id: number };

        await apiRequest("PATCH", "/api/app-branding", { appLogoId: logo.id });
        await queryClient.invalidateQueries({ queryKey: ["/api/app-branding"] });
        toast({ title: "App logo updated", description: "The new logo is now the active app logo." });
      } catch {
        toast({ title: "Failed to assign logo", description: "Upload succeeded but setting the logo failed.", variant: "destructive" });
      } finally {
        setIsSaving(false);
      }
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Could not upload the image. Please try again.", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    uploadFile(file);
  };

  const isBusy = isUploading || isSaving;

  return (
    <div className="space-y-6" data-testid="admin-app-logo-tab">
      <div>
        <p className="text-sm text-muted-foreground">
          The app logo appears in the top navigation bar and on the login page. Only super administrators
          can change it. Upload a PNG or SVG — square or near-square logos work best.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center justify-center bg-muted/30 border-b border-border aspect-square">
            {isLoading ? (
              <Skeleton className="w-24 h-24 rounded-lg" />
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                <IconAlertTriangle className="w-8 h-8" />
                <p className="text-xs">Failed to load</p>
              </div>
            ) : branding?.appLogoUrl ? (
              <img
                src={branding.appLogoUrl}
                alt="Current app logo"
                className="w-full h-full object-contain p-8"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                <IconImage className="w-10 h-10" />
                <p className="text-xs text-center px-4">No app logo set</p>
              </div>
            )}
          </div>
          <CardContent className="p-3">
            <p className="text-xs font-medium text-foreground">Current App Logo</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {branding?.appName ?? "H+ Analytics"}
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 justify-start pt-1">
          <p className="text-sm font-medium text-foreground">Replace App Logo</p>
          <p className="text-xs text-muted-foreground">
            Select an image file from your device. PNG, JPG, SVG, or WebP. The existing logo will be replaced immediately.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || isLoading}
            className="gap-2 self-start"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isUploading ? "Uploading…" : "Saving…"}
              </>
            ) : (
              <>
                <IconImage className="w-4 h-4" />
                Upload New Logo
              </>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground">
            Restricted to super administrators only.
          </p>
        </div>
      </div>
    </div>
  );
}
