import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  IconSparkles,
  IconImage,
  IconAlertTriangle,
  IconDownload,
  IconSend,
  IconTrash,
} from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { useToast } from "@/hooks/use-toast";
import { useAddPropertyPhoto } from "@/lib/api";
import { useProperties } from "@/lib/api/properties";
import type { GenerationStyle } from "@/features/property-images/useGenerateImage";

interface StyleOption {
  key: string;
  label: string;
  enabled: boolean;
}

interface GeneratedResult {
  id: string;
  objectPath: string;
  imageData?: string;
  style: string;
  prompt: string;
  hasSourcePhoto: boolean;
  usedFallback: boolean;
  fallbackNotice?: string;
  createdAt: number;
}

const RESULTS_STORAGE_KEY = "photos-and-renders:results";
const MAX_PERSISTED_RESULTS = 12;

function loadPersistedResults(): GeneratedResult[] {
  try {
    const raw = localStorage.getItem(RESULTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.objectPath === "string");
  } catch {
    return [];
  }
}

function savePersistedResults(results: GeneratedResult[]) {
  try {
    const trimmed = results.slice(0, MAX_PERSISTED_RESULTS).map((r) => ({
      ...r,
      // Drop base64 image data from local storage to keep size small;
      // the objectPath URL still renders the gallery thumbnail.
      imageData: undefined,
    }));
    localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota errors
  }
}

async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function PhotosAndRendersSpecialistPage() {
  const { toast } = useToast();
  const { data: stylesResp, isLoading: stylesLoading } = useQuery<{ styles: StyleOption[] }>({
    queryKey: ["/api/replicate/styles"],
  });
  const enabledStyles = useMemo(
    () => (stylesResp?.styles ?? []).filter((s) => s.enabled),
    [stylesResp],
  );

  const [style, setStyle] = useState<string>("");
  useEffect(() => {
    if (!style && enabledStyles.length > 0) setStyle(enabledStyles[0].key);
  }, [enabledStyles, style]);

  const [prompt, setPrompt] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedResult[]>(() => loadPersistedResults());

  useEffect(() => {
    savePersistedResults(results);
  }, [results]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSourceFile(file);
    if (file) {
      try {
        const dataUri = await fileToDataUri(file);
        setSourcePreview(dataUri);
      } catch {
        setSourcePreview(null);
      }
    } else {
      setSourcePreview(null);
    }
  };

  const handleClearSource = () => {
    setSourceFile(null);
    setSourcePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canRun =
    !!style &&
    !isRunning &&
    (prompt.trim().length > 0 || !!sourcePreview);

  const handleRun = async () => {
    if (!canRun) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        style: style as GenerationStyle,
      };
      if (sourcePreview) body.beforeImageUrl = sourcePreview;

      const res = await fetch("/api/generate-property-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as Record<string, string>));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      const result: GeneratedResult = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        objectPath: data.objectPath,
        imageData: data.imageData,
        style: data.style,
        prompt: prompt.trim(),
        hasSourcePhoto: !!sourcePreview,
        usedFallback: !!data.usedFallback,
        fallbackNotice: data.fallbackNotice,
        createdAt: Date.now(),
      };
      setResults((prev) => [result, ...prev]);
      if (data.usedFallback && data.fallbackNotice) {
        toast({ title: "Fallback used", description: data.fallbackNotice });
      } else {
        toast({ title: "Image generated", description: "Added to results gallery." });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setRunError(message);
      toast({ title: "Generation failed", description: message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const handleClearResults = () => {
    setResults([]);
  };

  return (
    <div className="space-y-6" data-testid="page-photos-and-renders">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Badge variant="outline" data-testid="badge-specialist-letter">L</Badge>
          <h2 className="text-xl font-semibold">Photos &amp; Renders</h2>
          <Badge variant="secondary">Needs page</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Drive image transformations and creations from a single page. Upload a source photo, write
          a prompt, or both — then push results into a property album when you&apos;re happy.
        </p>
      </div>

      <Alert data-testid="banner-needs-page">
        <IconAlertTriangle className="w-4 h-4" />
        <AlertTitle>Specialist not yet wired into the engine</AlertTitle>
        <AlertDescription>
          Jobs run through the existing Replicate render pipeline and obey the rate limits and
          prompt config from the admin Photos &amp; Renders settings. Per-Specialist prompt and
          model overrides will activate once the evaluator ships.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Run a job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Transformation / style</label>
            <Select value={style} onValueChange={(v) => setStyle(v)} disabled={stylesLoading}>
              <SelectTrigger data-testid="select-render-style">
                <SelectValue placeholder={stylesLoading ? "Loading styles…" : "Choose a style"} />
              </SelectTrigger>
              <SelectContent>
                {enabledStyles.map((s) => (
                  <SelectItem key={s.key} value={s.key} data-testid={`option-style-${s.key}`}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Styles come from the admin render settings — disabled styles are hidden.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Source photo (optional)</label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                data-testid="input-source-photo"
              />
              {sourcePreview && (
                <div className="space-y-2">
                  <div className="rounded-md border overflow-hidden bg-muted/30">
                    <img
                      src={sourcePreview}
                      alt="Source preview"
                      className="w-full aspect-[4/3] object-contain bg-black/5"
                      data-testid="img-source-preview"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{sourceFile?.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSource}
                      data-testid="button-clear-source"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt (optional)</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the transformation, render, or avatar you want…"
                rows={8}
                className="resize-none"
                data-testid="input-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Provide a photo, a prompt, or both. At least one is required.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button onClick={handleRun} disabled={!canRun} data-testid="button-run-job">
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <IconSparkles className="w-4 h-4 mr-2" />
                  Run
                </>
              )}
            </Button>
          </div>

          {runError && (
            <Alert variant="destructive" data-testid="alert-run-error">
              <IconAlertTriangle className="w-4 h-4" />
              <AlertTitle>Job failed</AlertTitle>
              <AlertDescription>{runError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Results gallery</CardTitle>
            {results.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearResults}
                data-testid="button-clear-results"
              >
                <IconTrash className="w-4 h-4 mr-1.5" />
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"
              data-testid="empty-results"
            >
              <IconImage className="w-8 h-8 opacity-60" />
              <p>No results yet. Run a job above to see output here.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((r) => (
                <ResultCard key={r.id} result={r} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultCard({ result }: { result: GeneratedResult }) {
  const { toast } = useToast();
  const { data: properties = [], isLoading: propertiesLoading } = useProperties();
  const addPhoto = useAddPropertyPhoto();
  const [propertyId, setPropertyId] = useState<string>("");
  const [isSending, setIsSending] = useState(false);

  const handleSendToProperty = async () => {
    const numId = Number(propertyId);
    if (!numId) {
      toast({ title: "Pick a property first", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      await addPhoto.mutateAsync({
        propertyId: numId,
        imageUrl: result.objectPath,
        generationStyle: result.style,
        imageData: result.imageData,
      });
      toast({ title: "Sent to property album" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send";
      toast({ title: "Send failed", description: message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="rounded-lg border overflow-hidden bg-card flex flex-col"
      data-testid={`result-card-${result.id}`}
    >
      <div className="relative bg-muted/30">
        <img
          src={result.objectPath}
          alt={`Generated ${result.style}`}
          className="w-full aspect-[4/3] object-cover"
          data-testid={`img-result-${result.id}`}
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <Badge className="text-[10px]" data-testid={`badge-style-${result.id}`}>
            {result.style}
          </Badge>
          {result.usedFallback && (
            <Badge variant="outline" className="text-[10px] bg-background/80">
              Fallback
            </Badge>
          )}
        </div>
      </div>
      <div className="p-3 space-y-3 flex-1 flex flex-col">
        {result.prompt && (
          <p className="text-xs text-muted-foreground line-clamp-2" title={result.prompt}>
            {result.prompt}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Select value={propertyId} onValueChange={setPropertyId} disabled={propertiesLoading}>
            <SelectTrigger className="flex-1" data-testid={`select-property-${result.id}`}>
              <SelectValue placeholder={propertiesLoading ? "Loading…" : "Choose property…"} />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem
                  key={p.id}
                  value={String(p.id)}
                  data-testid={`option-property-${result.id}-${p.id}`}
                >
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 mt-auto">
          <Button
            variant="outline"
            size="sm"
            asChild
            data-testid={`button-download-${result.id}`}
          >
            <a href={result.objectPath} download target="_blank" rel="noreferrer">
              <IconDownload className="w-4 h-4 mr-1.5" />
              Download
            </a>
          </Button>
          <Button
            size="sm"
            onClick={handleSendToProperty}
            disabled={!propertyId || isSending}
            className="flex-1"
            data-testid={`button-send-${result.id}`}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <IconSend className="w-4 h-4 mr-1.5" />
                Send to property
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
