import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { useToast } from "@/hooks/use-toast";
import { useProperties } from "@/lib/api/properties";
import { useAddPropertyPhoto } from "@/lib/api/property-photos";

// Inherit the standard specialist console (workflow / identity / sources /
// runtime tabs) so Fernanda's render console keeps full feature parity
// with every other specialist page — we are only adding a "Render
// History" gallery panel below it. Lazy-loaded for the same chunking
// reasons the parent SectionContent uses.
const SpecialistPage = lazy(() => import("@/pages/admin/specialist/SpecialistPage"));

const PHOTO_ENHANCER_SPECIALIST_ID = "photos.photo-enhancer";
const PAGE_SIZE = 24;

// Server-emitted gallery row. Mirrors the PhotoEnhancerGalleryRow type in
// server/routes/specialist-photo-enhancer.ts. Kept inline (rather than
// imported from server) because the client bundle must not pull server
// modules.
interface GalleryRun {
  id: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  status: string;
  modelPrimary: string | null;
  entityType: string;
  entityId: number;
  error: string | null;
  prompt: string;
  style: string | null;
  finalStyle: string | null;
  sourceImageUrl: string | null;
  objectPath: string | null;
  propertyId: number | null;
  originatedFrom: string | null;
  usedFallback: boolean;
  userId: number | null;
  userDisplayName: string | null;
}

interface CallsResponse {
  specialistId: string;
  total: number;
  limit: number;
  offset: number;
  runs: GalleryRun[];
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "running":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function GalleryCard({ run }: { run: GalleryRun }) {
  const { toast } = useToast();
  const properties = useProperties();
  const addPhoto = useAddPropertyPhoto();
  const [targetPropertyId, setTargetPropertyId] = useState<string>("");

  // The "send to property" action is the historic gallery affordance —
  // an admin who likes a render can drop it into any property's photo
  // album without going back to the property edit page. We disable it
  // for runs without an objectPath (still running, failed, or legacy).
  const canSend = run.status === "completed" && !!run.objectPath;
  const sendDisabled = !canSend || !targetPropertyId || addPhoto.isPending;

  async function handleSend() {
    if (!run.objectPath || !targetPropertyId) return;
    try {
      await addPhoto.mutateAsync({
        propertyId: Number(targetPropertyId),
        imageUrl: run.objectPath,
        caption: run.prompt ? run.prompt.slice(0, 200) : undefined,
        generationStyle: run.finalStyle ?? run.style ?? undefined,
        skipProcessing: true,
      });
      toast({
        title: "Sent to property",
        description: "The generated image was added to the property photo album.",
      });
      setTargetPropertyId("");
    } catch (err: unknown) {
      toast({
        title: "Failed to send to property",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <Card data-testid={`card-gallery-run-${run.id}`} className="overflow-hidden flex flex-col">
      <div className="relative bg-muted aspect-square">
        {run.objectPath ? (
          <img
            src={run.objectPath}
            alt={run.prompt || "Generated render"}
            className="w-full h-full object-cover"
            data-testid={`img-result-${run.id}`}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            {run.status === "running" ? "Rendering…" : "No image"}
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge variant={statusVariant(run.status)} data-testid={`badge-status-${run.id}`}>
            {run.status}
          </Badge>
          {run.usedFallback && (
            <Badge variant="outline" data-testid={`badge-fallback-${run.id}`}>fallback</Badge>
          )}
        </div>
      </div>

      <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="text-xs" data-testid={`badge-style-${run.id}`}>
            {run.finalStyle ?? run.style ?? "unknown"}
          </Badge>
          <span className="text-[11px] text-muted-foreground" data-testid={`text-when-${run.id}`}>
            {formatDateTime(run.startedAt)}
          </span>
        </div>

        <p
          className="text-xs text-muted-foreground line-clamp-3 min-h-[36px]"
          data-testid={`text-prompt-${run.id}`}
          title={run.prompt}
        >
          {run.prompt || <span className="italic">(no prompt recorded)</span>}
        </p>

        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          <span data-testid={`text-admin-${run.id}`}>
            By: {run.userDisplayName ?? "unknown admin"}
          </span>
          {run.durationMs !== null && (
            <span data-testid={`text-duration-${run.id}`}>{formatDuration(run.durationMs)}</span>
          )}
          {run.originatedFrom && (
            <span data-testid={`text-origin-${run.id}`}>via {run.originatedFrom}</span>
          )}
        </div>

        {run.sourceImageUrl && (
          <a
            href={run.sourceImageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-primary underline truncate"
            data-testid={`link-source-${run.id}`}
          >
            View source photo
          </a>
        )}

        <div className="mt-auto pt-2 border-t flex flex-col gap-2">
          <Select
            value={targetPropertyId}
            onValueChange={setTargetPropertyId}
            disabled={!canSend || properties.isLoading}
          >
            <SelectTrigger
              className="h-8 text-xs"
              data-testid={`select-property-${run.id}`}
            >
              <SelectValue placeholder="Send to property…" />
            </SelectTrigger>
            <SelectContent>
              {(properties.data ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)} data-testid={`option-property-${p.id}-${run.id}`}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={sendDisabled}
            data-testid={`button-send-${run.id}`}
          >
            {addPhoto.isPending ? "Sending…" : "Send to property"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GalleryPanel() {
  // Local pagination state — we keep the offset client-side so React
  // Query can cache each page independently (`queryKey` includes the
  // offset) and the user can scroll back without re-fetching. "Load
  // more" appends the next page in-memory rather than refetching the
  // whole stream.
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<GalleryRun[]>([]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<CallsResponse>({
    queryKey: ["specialist-photo-enhancer-calls", offset],
    queryFn: async () => {
      const res = await fetch(
        `/api/specialists/photo-enhancer/calls?limit=${PAGE_SIZE}&offset=${offset}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Failed to load gallery (${res.status})`);
      return res.json() as Promise<CallsResponse>;
    },
  });

  // Append-on-success: the accumulator is the source of truth the grid
  // renders from. We dedupe by id so a re-fetch (or the gallery being
  // refreshed mid-pagination) can't duplicate cards.
  useEffect(() => {
    if (!data?.runs) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const merged = [...prev];
      for (const r of data.runs) {
        if (!seen.has(r.id)) {
          merged.push(r);
          seen.add(r.id);
        }
      }
      return merged;
    });
  }, [data]);

  const total = data?.total ?? 0;
  const showing = accumulated.length;
  const hasMore = showing < total;

  function handleRefresh() {
    setAccumulated([]);
    setOffset(0);
    refetch();
  }

  function handleLoadMore() {
    setOffset((o) => o + PAGE_SIZE);
  }

  return (
    <Card data-testid="card-gallery-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle data-testid="text-gallery-title">Fernanda's Render History</CardTitle>
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-gallery-counts">
            {isLoading
              ? "Loading…"
              : `Showing ${showing.toLocaleString()} of ${total.toLocaleString()} renders dispatched through Fernanda`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          data-testid="button-refresh-gallery"
        >
          {isFetching ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3"
            data-testid="text-gallery-error"
          >
            {error instanceof Error ? error.message : "Failed to load gallery"}
          </div>
        )}

        {isLoading && accumulated.length === 0 ? (
          <div className="flex items-center justify-center py-12" data-testid="loader-gallery">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : accumulated.length === 0 ? (
          <div
            className="py-12 text-center text-sm text-muted-foreground"
            data-testid="text-gallery-empty"
          >
            Fernanda hasn't run any renders yet. Trigger a render from a
            property photo album to populate this history.
          </div>
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
            data-testid="grid-gallery"
          >
            {accumulated.map((run) => (
              <GalleryCard key={run.id} run={run} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleLoadMore}
              disabled={isFetching}
              data-testid="button-load-more-gallery"
            >
              {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Load more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FernandaRenderConsolePage() {
  return (
    // Fernanda owns this surface (`specialist-photos-photo-enhancer`
    // routing slug, persona Fernanda from specialist-catalog). The
    // routing slug predates the rename and is left as-is because it is
    // load-bearing across the sidebar, AdminSidebar, and section meta;
    // update the slug and all its dependents together if/when this is
    // ever rebranded.
    <div className="space-y-6" data-testid="page-fernanda-render-console">
      {/* Inner Suspense isolates the SpecialistPage chunk so that if the
          outer AiIntelligence Suspense already resolved Fernanda's
          render console, a slow nested chunk doesn't blank the whole
          layout — the render history below stays visible. */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <SpecialistPage specialistId={PHOTO_ENHANCER_SPECIALIST_ID} />
      </Suspense>
      <GalleryPanel />
    </div>
  );
}
