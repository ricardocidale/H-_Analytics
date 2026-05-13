import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { useProperties } from "../SlideFactoryHooks";
import type { SlideFactoryRun } from "../SlideFactoryTypes";
import { FactoryPropertySelector } from "./SharedComponents";

// ── Tab 3 — Properties ──────────────────────────────────────────────────────

// Canonical L+B deck slot → slide number mapping. Slide 4 (Hazelnis spotlight)
// and slide 6 (income statement) are auto-generated and not picked here.
const SPOTLIGHT_SLIDE = 1;
const GALLERY_SLIDE = 2;
const INVESTMENT_MODEL_SLIDE = 3;
const FINANCIAL_SNAPSHOT_SLIDE = 5;

export function FactoryPropertiesTab({
  run,
  onRunUpdate,
}: {
  run: SlideFactoryRun;
  onRunUpdate: (r: SlideFactoryRun) => void;
}) {
  const { toast } = useToast();
  const { data: properties = [], isLoading: propsLoading } = useProperties();
  const [saved, setSaved] = useState(false);

  const [s1, setS1] = useState<number | null>(run.slide1PropertyId);
  const [s2, setS2] = useState<number | null>(run.slide2PropertyId);
  const [s3, setS3] = useState<number | null>(run.slide3PropertyId);
  const [s5, setS5] = useState<number | null>(run.slide5PropertyId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Send every slot as an explicit value (number or null). Skipping null
      // keys would not preserve existing assignments anyway — the server
      // coerces `undefined` to `null` (see slide-factory.ts handler) — so we
      // send nulls explicitly to make the intent legible at the call site.
      const body: Record<string, number | null> = {
        slide1PropertyId: s1,
        slide2PropertyId: s2,
        slide3PropertyId: s3,
        slide5PropertyId: s5,
      };

      const r = await apiRequest("POST", `/api/lb-slides/factory/runs/${run.id}/properties`, body);
      return r.json() as Promise<SlideFactoryRun>;
    },
    onSuccess: (updated) => {
      onRunUpdate(updated);
      setSaved(true);
      toast({ title: "Properties saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save properties", description: err.message, variant: "destructive" });
    },
  });

  if (saved) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <p className="text-sm font-medium">
            Properties saved — waiting for Lucca to draft
          </p>
          <p className="text-xs text-muted-foreground">
            The Lucca agent will begin drafting slide content shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assign Properties</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Choose which property appears on each spotlight slide. Slides 4 and 6
          are auto-generated.
        </p>

        <FactoryPropertySelector
          slideNum={SPOTLIGHT_SLIDE}
          description="Pipeline Spotlight · hero photo + specs"
          value={s1}
          onChange={setS1}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />
        <FactoryPropertySelector
          slideNum={GALLERY_SLIDE}
          description="Photo Gallery · 2×2 photo showcase"
          value={s2}
          onChange={setS2}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />
        <FactoryPropertySelector
          slideNum={INVESTMENT_MODEL_SLIDE}
          description="Investment Model · concept + market rationale"
          value={s3}
          onChange={setS3}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />
        <FactoryPropertySelector
          slideNum={FINANCIAL_SNAPSHOT_SLIDE}
          description="Financial Snapshot · transformation plan"
          value={s5}
          onChange={setS5}
          properties={properties}
          disabled={propsLoading || saveMutation.isPending}
        />

        <div className="rounded-md bg-muted/40 border border-border/50 px-3 py-2.5 space-y-0.5">
          <p className="font-medium text-foreground/80 text-xs uppercase tracking-wide mb-1">
            Auto-generated — no assignment needed
          </p>
          <p className="text-muted-foreground text-xs">
            Slide 4 — Portfolio grid of all properties with hero photos
          </p>
          <p className="text-muted-foreground text-xs">
            Slide 6 — 10-year aggregated USALI consolidated income statement
          </p>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || propsLoading}
          className="w-full sm:w-auto"
        >
          {saveMutation.isPending && (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          )}
          Save property assignments
        </Button>
      </CardContent>
    </Card>
  );
}
