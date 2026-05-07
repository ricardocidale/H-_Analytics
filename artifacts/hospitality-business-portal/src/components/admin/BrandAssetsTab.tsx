import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconImage, IconCopy, IconCheck, IconAlertTriangle } from "@/components/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface BrandAsset {
  key: string;
  filename: string;
  label: string;
  category: "logo" | "og";
  url: string;
  exists: boolean;
  lastModified: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 shrink-0"
      onClick={handleCopy}
      title="Copy R2 key"
      data-testid="button-copy-r2-key"
    >
      {copied ? (
        <IconCheck className="w-3 h-3 text-green-600" />
      ) : (
        <IconCopy className="w-3 h-3 text-muted-foreground" />
      )}
    </Button>
  );
}

function AssetCard({ asset }: { asset: BrandAsset }) {
  const formatted = asset.lastModified
    ? new Date(asset.lastModified).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Card
      className={cn(
        "bg-card border border-border/80 shadow-sm overflow-hidden",
        !asset.exists && "border-dashed opacity-70",
      )}
      data-testid={`brand-asset-card-${asset.filename}`}
    >
      <CardContent className="p-0">
        {/* Preview */}
        <div
          className={cn(
            "relative flex items-center justify-center bg-muted/30 border-b border-border/60",
            asset.category === "og" ? "aspect-[1200/630]" : "aspect-square",
          )}
        >
          {asset.exists ? (
            <img
              src={asset.url}
              alt={asset.label}
              className="w-full h-full object-contain p-4"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground/50">
              <IconAlertTriangle className="w-8 h-8" />
              <p className="text-xs text-center px-4">Not yet uploaded to R2</p>
            </div>
          )}

          {/* Category badge */}
          <Badge
            variant="outline"
            className="absolute top-2 right-2 text-[10px] bg-background/80 backdrop-blur-sm"
          >
            {asset.category === "og" ? "OG Banner" : "Logo"}
          </Badge>
        </div>

        {/* Metadata */}
        <div className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs font-semibold text-foreground leading-tight">{asset.label}</p>
            <CopyButton text={asset.key} />
          </div>

          <p
            className="text-[10px] text-muted-foreground font-mono break-all leading-relaxed"
            title={asset.key}
          >
            {asset.key}
          </p>

          <div className="flex items-center gap-1.5 pt-0.5">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                asset.exists ? "bg-green-500" : "bg-amber-400",
              )}
            />
            <span className="text-[10px] text-muted-foreground">
              {asset.exists
                ? formatted
                  ? `Uploaded ${formatted}`
                  : "In R2"
                : "Run upload:brand-assets to populate"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetCardSkeleton() {
  return (
    <Card className="border border-border/80 overflow-hidden">
      <CardContent className="p-0">
        <Skeleton className="aspect-square w-full" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrandAssetsTab() {
  const { data: assets, isLoading, isError } = useQuery<BrandAsset[]>({
    queryKey: ["/api/admin/brand-assets"],
  });

  return (
    <div className="space-y-4" data-testid="admin-brand-assets-tab">
      <div>
        <p className="text-sm text-muted-foreground">
          Canonical H+ brand files stored in R2. Copy an R2 key to reference it in scripts or
          slide configs. Run{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">
            pnpm --filter @workspace/scripts run upload:brand-assets
          </code>{" "}
          to populate or refresh.
        </p>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <IconAlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Failed to load brand assets.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [1, 2, 3].map((i) => <AssetCardSkeleton key={i} />)
          : assets?.map((asset) => <AssetCard key={asset.key} asset={asset} />)}
      </div>

      {!isLoading && assets && assets.every((a) => !a.exists) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium mb-1">No assets uploaded yet</p>
          <p>
            The source files are in{" "}
            <code className="text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">
              attached_assets/canonical/brand/
            </code>
            . Run the upload script to push them to R2.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <IconImage className="w-3.5 h-3.5 text-muted-foreground/60" />
        <p className="text-[11px] text-muted-foreground">
          Brand assets are served via{" "}
          <code className="text-[10px] bg-muted px-1 rounded">/api/brand-assets/&lt;filename&gt;</code>{" "}
          — immutable 1-year cache, public route.
        </p>
      </div>
    </div>
  );
}
