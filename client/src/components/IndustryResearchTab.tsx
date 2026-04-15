import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Search, Check, X, Loader2 } from "@/components/icons/themed-icons";
import { IconGlobe, IconMessageSquare, IconPencil, IconTrash, IconRefreshCw, IconPlus } from "@/components/icons";
import { DEFAULT_PROPERTY_INFLATION_RATE } from "@shared/constants";
import { useGlobalAssumptions, useResearchQuestions, useCreateResearchQuestion, useUpdateResearchQuestion, useDeleteResearchQuestion } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const FOCUS_AREA_OPTIONS = [
  { id: "market", label: "Market Overview & Trends" },
  { id: "events", label: "Event Hospitality (wellness, corporate, yoga, relationship retreats)" },
  { id: "benchmarks", label: "Financial Benchmarks (ADR, occupancy, RevPAR)" },
  { id: "caprates", label: "Cap Rates & Investment Returns" },
  { id: "debt", label: "Debt Market Conditions" },
  { id: "emerging", label: "Emerging Trends in Experiential Hospitality" },
  { id: "supply", label: "New Supply Pipeline & Construction Activity" },
  { id: "labor", label: "Labor Market & Staffing Trends" },
  { id: "technology", label: "Technology & PropTech Adoption" },
  { id: "sustainability", label: "Sustainability & ESG in Hospitality" },
];

const REGION_OPTIONS = [
  { id: "north_america", label: "North America" },
  { id: "latin_america", label: "Latin America" },
  { id: "europe", label: "Europe" },
  { id: "asia_pacific", label: "Asia Pacific" },
  { id: "middle_east", label: "Middle East & Africa" },
  { id: "caribbean", label: "Caribbean" },
];

const TIME_HORIZON_OPTIONS = [
  { value: "1 year", label: "1 Year" },
  { value: "3 years", label: "3 Years" },
  { value: "5 years", label: "5 Years" },
  { value: "10 years", label: "10 Years" },
];

export function IndustryResearchTab() {
  const { data: global } = useGlobalAssumptions();
  const { data: researchQuestions = [] } = useResearchQuestions();
  const createQuestion = useCreateResearchQuestion();
  const updateQuestion = useUpdateResearchQuestion();
  const deleteQuestion = useDeleteResearchQuestion();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>(
    FOCUS_AREA_OPTIONS.slice(0, 6).map(o => o.label)
  );
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["North America", "Latin America"]);
  const [timeHorizon, setTimeHorizon] = useState("5 years");
  const [newQuestion, setNewQuestion] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const currentGlobal = global ?? ({} as Partial<NonNullable<typeof global>>);

  const generateResearch = useCallback(async () => {
    setIsGenerating(true);
    setStreamedContent("");
    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/research/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "global",
          researchVariables: {
            focusAreas: selectedFocusAreas,
            regions: selectedRegions,
            timeHorizon,
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Server returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                accumulated += data.content;
                setStreamedContent(accumulated);
              }
              if (data.done) {
                queryClient.invalidateQueries({ queryKey: ["research", "global"] });
                queryClient.invalidateQueries({ queryKey: ["research", "status"] });
              }
            } catch { /* incomplete SSE chunk */ }
          }
        }
      }
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast({ title: "Error", description: error instanceof Error ? error.message : "Research generation failed. Please try again.", variant: "destructive" });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [selectedFocusAreas, selectedRegions, timeHorizon, queryClient, toast]);

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <IconGlobe className="w-5 h-5 text-primary" />
            Your Model Context
            <InfoTooltip text="These values come from your systemwide assumptions and are automatically included in the research prompt so the AI tailors its analysis to your portfolio." />
          </CardTitle>
          <CardDescription className="label-text">These systemwide settings shape your research. Edit them in General Configuration and Management Company Profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-3 bg-primary/10 border border-primary/20">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Asset Type</p>
              <p className="text-sm font-semibold text-foreground" data-testid="text-research-asset-type">{currentGlobal.propertyLabel || "Boutique Hotel"}</p>
            </div>
            <div className="rounded-xl p-3 bg-primary/10 border border-primary/20">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Tier</p>
              <p className="text-sm font-semibold text-foreground capitalize" data-testid="text-research-tier">{currentGlobal.assetDefinition?.level || "luxury"}</p>
            </div>
            <div className="rounded-xl p-3 bg-chart-1/10 border border-chart-1/20">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Room Range</p>
              <p className="text-sm font-semibold text-foreground" data-testid="text-research-rooms">{currentGlobal.assetDefinition?.minRooms ?? 10}–{currentGlobal.assetDefinition?.maxRooms ?? 80}</p>
            </div>
            <div className="rounded-xl p-3 bg-chart-1/10 border border-chart-1/20">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">ADR Range</p>
              <p className="text-sm font-semibold text-foreground" data-testid="text-research-adr">${currentGlobal.assetDefinition?.minAdr ?? 150}–${currentGlobal.assetDefinition?.maxAdr ?? 600}</p>
            </div>
            <div className="rounded-xl p-3 bg-accent-pop/10 border border-accent-pop/20">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Inflation</p>
              <p className="text-sm font-semibold text-foreground" data-testid="text-research-inflation">{((currentGlobal.inflationRate ?? DEFAULT_PROPERTY_INFLATION_RATE) * 100).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl p-3 bg-accent-pop/10 border border-accent-pop/20">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Model Duration</p>
              <p className="text-sm font-semibold text-foreground" data-testid="text-research-duration">{currentGlobal.projectionYears ?? 10} years</p>
            </div>
            <div className="rounded-xl p-3 bg-muted border border-border col-span-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Features</p>
              <div className="flex flex-wrap gap-1.5" data-testid="text-research-features">
                {currentGlobal.assetDefinition?.hasFB && <span className="text-xs bg-card px-2 py-0.5 rounded-full border border-border">F&B</span>}
                {currentGlobal.assetDefinition?.hasEvents && <span className="text-xs bg-card px-2 py-0.5 rounded-full border border-border">Events</span>}
                {currentGlobal.assetDefinition?.hasWellness && <span className="text-xs bg-card px-2 py-0.5 rounded-full border border-border">Wellness</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Search className="w-5 h-5 text-primary" />
            Research Variables
            <InfoTooltip text="Configure what the AI should research. Select focus areas, target regions, and time horizon. Add custom questions for specific topics." />
          </CardTitle>
          <CardDescription className="label-text">Customize the scope and focus of AI-generated industry research</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="label-text font-medium">Focus Areas</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FOCUS_AREA_OPTIONS.map((option) => (
                <div key={option.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id={`focus-${option.id}`}
                    checked={selectedFocusAreas.includes(option.label)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedFocusAreas([...selectedFocusAreas, option.label]);
                      } else {
                        setSelectedFocusAreas(selectedFocusAreas.filter(a => a !== option.label));
                      }
                    }}
                    data-testid={`checkbox-focus-${option.id}`}
                  />
                  <Label htmlFor={`focus-${option.id}`} className="text-sm cursor-pointer flex-1">{option.label}</Label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="label-text font-medium">Target Regions</Label>
              <div className="space-y-2">
                {REGION_OPTIONS.map((option) => (
                  <div key={option.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={`region-${option.id}`}
                      checked={selectedRegions.includes(option.label)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedRegions([...selectedRegions, option.label]);
                        } else {
                          setSelectedRegions(selectedRegions.filter(r => r !== option.label));
                        }
                      }}
                      data-testid={`checkbox-region-${option.id}`}
                    />
                    <Label htmlFor={`region-${option.id}`} className="text-sm cursor-pointer">{option.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="label-text font-medium">Time Horizon</Label>
              <RadioGroup
                value={timeHorizon}
                onValueChange={setTimeHorizon}
                className="space-y-2"
                data-testid="radio-time-horizon"
              >
                {TIME_HORIZON_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value={option.value} id={`horizon-${option.value}`} data-testid={`radio-horizon-${option.value.replace(/\s/g, '-')}`} />
                    <Label htmlFor={`horizon-${option.value}`} className="text-sm cursor-pointer">{option.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="label-text font-medium flex items-center gap-1">
              <IconMessageSquare className="w-4 h-4" />
              Custom Research Questions
              <InfoTooltip text="Add specific research questions or qualifiers for the AI to address. Each question is sent to the AI as part of the research prompt." />
            </Label>

            {researchQuestions.length > 0 && (
              <div className="space-y-2">
                {researchQuestions.map((q: any) => (
                  <div key={q.id} className="group flex items-start gap-2 p-2.5 rounded-lg bg-muted border border-border hover:border-primary/30 transition-colors" data-testid={`research-question-${q.id}`}>
                    {editingQuestionId === q.id ? (
                      <div className="flex-1 flex items-start gap-2">
                        <Input
                          value={editingQuestionText}
                          onChange={(e) => setEditingQuestionText(e.target.value)}
                          className="flex-1 text-sm bg-card"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingQuestionText.trim()) {
                              updateQuestion.mutate({ id: q.id, question: editingQuestionText.trim() });
                              setEditingQuestionId(null);
                            }
                            if (e.key === "Escape") setEditingQuestionId(null);
                          }}
                          data-testid={`input-edit-question-${q.id}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-primary hover:text-primary/80"
                          onClick={() => {
                            if (editingQuestionText.trim()) {
                              updateQuestion.mutate({ id: q.id, question: editingQuestionText.trim() });
                            }
                            setEditingQuestionId(null);
                          }}
                          data-testid={`button-save-question-${q.id}`}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-muted-foreground"
                          onClick={() => setEditingQuestionId(null)}
                          data-testid={`button-cancel-edit-${q.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="flex-1 text-sm text-foreground pt-0.5">{q.question}</p>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-card"
                            onClick={() => {
                              setEditingQuestionId(q.id);
                              setEditingQuestionText(q.question);
                            }}
                            data-testid={`button-edit-question-${q.id}`}
                          >
                            <IconPencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-card"
                            onClick={() => deleteQuestion.mutate(q.id)}
                            data-testid={`button-delete-question-${q.id}`}
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                placeholder="Add a custom question (e.g. 'What is the local labor market like for housekeeping staff?')"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newQuestion.trim()) {
                    createQuestion.mutate(newQuestion.trim());
                    setNewQuestion("");
                  }
                }}
                className="bg-card text-sm"
                data-testid="input-new-research-question"
              />
              <Button
                size="sm"
                className="shrink-0"
                disabled={!newQuestion.trim() || createQuestion.isPending}
                onClick={() => {
                  createQuestion.mutate(newQuestion.trim());
                  setNewQuestion("");
                }}
                data-testid="button-add-research-question"
              >
                {createQuestion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconPlus className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
              onClick={generateResearch}
              disabled={isGenerating}
              data-testid="button-trigger-global-research"
            >
              {isGenerating ? (
                <>
                  <IconRefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Generating Market Analysis...
                </>
              ) : (
                <>
                  <IconRefreshCw className="w-5 h-5 mr-2" />
                  Ask the Analyst
                </>
              )}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground mt-2 uppercase tracking-widest font-medium">
              Powered by Norfolk AI
            </p>
          </div>
        </CardContent>
      </Card>

      {isGenerating && streamedContent && (
        <Card className="border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <IconRefreshCw className="w-4 h-4 animate-spin text-primary" />
              Real-time Generation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {streamedContent}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
