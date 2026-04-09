import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconPlus, IconRefreshCw, IconResearch, IconFlaskConical,
  IconDownload, IconSparkles, IconCopy, IconPencil, IconTrash, IconWand2,
  IconFileText,
} from "@/components/icons";
import { EnableToggle } from "./research-shared";
import { useIcpResearch } from "./useIcpResearch";
import { IcpSourcesPanel } from "./IcpSourcesPanel";

interface IcpResearchSectionProps {
  enabled: boolean;
  onToggle: (v: boolean) => void;
}

export function IcpResearchSection({ enabled, onToggle }: IcpResearchSectionProps) {
  const h = useIcpResearch();

  return (
    <div className="space-y-4">
      <EnableToggle
        label="ICP Management Co Research"
        description="AI-powered research using the ICP Management Co definition to identify acquisition targets"
        enabled={enabled}
        onChange={onToggle}
      />
      {!enabled ? null : (<>
      <div className="flex gap-2 border-b border-border/50 pb-2 overflow-x-auto">
        {([
          { key: "ai-prompt", label: "AI Prompt" },
          { key: "icp-ai-prompt", label: "ICP AI Prompt" },
          { key: "research-text", label: "Research Text" },
          { key: "research-markdown", label: "Research Markdown" },
          { key: "sources", label: "Sources" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => h.setActiveSubTab(tab.key as typeof h.activeSubTab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              h.activeSubTab === tab.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            data-testid={`subtab-icp-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {h.activeSubTab === "ai-prompt" && (
        <div className="space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Research Questions</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Define the questions the ICP AI Prompt should answer when generating research.
            </p>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={h.newQuestionText}
                onChange={(e) => h.setNewQuestionText(e.target.value)}
                placeholder="e.g. What are the average ADR ranges by location for boutique luxury hotels?"
                className="h-9 text-xs bg-card"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); h.handleAddQuestion(); } }}
                data-testid="input-new-question"
              />
            </div>
            <Button size="sm" variant="default" onClick={h.handleAddQuestion} disabled={!h.newQuestionText.trim() || h.updateMutation.isPending} className="h-9 text-xs gap-1.5" data-testid="button-add-question">
              <IconPlus className="w-3.5 h-3.5" />
              Add Question
            </Button>
            <Button size="sm" variant="outline" onClick={h.handleReinsertDefaults} disabled={h.updateMutation.isPending} className="h-9 text-xs gap-1.5" data-testid="button-reinsert-defaults">
              <IconRefreshCw className="w-3.5 h-3.5" />
              Re-insert Default Questions
            </Button>
          </div>

          {h.promptBuilder.questions.length > 0 ? (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {h.promptBuilder.questions.map((q, idx) => (
                <div key={q.id} className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/20 group hover:bg-muted/40 transition-colors" data-testid={`question-${q.id}`}>
                  <span className="text-[10px] font-bold text-muted-foreground mt-0.5 shrink-0 w-5">{idx + 1}.</span>
                  {h.editingQuestionId === q.id ? (
                    <div className="flex-1 space-y-2">
                      <Input
                        value={h.editingQuestionText}
                        onChange={(e) => h.setEditingQuestionText(e.target.value)}
                        className="h-8 text-xs bg-card"
                        onKeyDown={(e) => { if (e.key === "Enter") h.handleSaveEditQuestion(); }}
                        autoFocus
                        data-testid="input-edit-question"
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="default" onClick={h.handleSaveEditQuestion} className="text-xs h-7" data-testid="button-save-edit-question">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => h.setEditingQuestionId(null)} className="text-xs h-7">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="flex-1 text-xs text-foreground/90 leading-relaxed">{q.question}</p>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" onClick={() => h.handleEditQuestion(q.id)} className="text-muted-foreground hover:text-primary h-auto w-auto p-0.5" data-testid={`edit-question-${q.id}`}>
                          <IconPencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" onClick={() => h.handleCopyQuestion(q.id)} className="text-muted-foreground hover:text-primary h-auto w-auto p-0.5" data-testid={`copy-question-${q.id}`}>
                          <IconCopy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" onClick={() => h.handleDeleteQuestion(q.id)} className="text-muted-foreground hover:text-destructive h-auto w-auto p-0.5" data-testid={`delete-question-${q.id}`}>
                          <IconTrash className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <IconResearch className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No research questions defined yet. Add questions above.</p>
            </div>
          )}

          <div className="pt-4 border-t border-border/40 space-y-3">
            <div>
              <Label className="text-sm font-medium">Additional Instructions</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Custom instructions to guide how the AI builds the research prompt and report.
              </p>
            </div>
            <Textarea
              value={h.promptBuilder.additionalInstructions}
              onChange={(e) => h.handleInstructionsChange(e.target.value)}
              onBlur={h.handleSaveInstructions}
              placeholder="e.g. Focus on luxury boutique segment specifically, highlight competitive landscape per market, include fee ranges for management and incentive fees..."
              rows={4}
              className="text-xs resize-none bg-card"
              data-testid="textarea-additional-instructions"
            />
          </div>

          <div className="pt-4 border-t border-border/40 space-y-3">
            <div>
              <Label className="text-sm font-medium">Context for ICP AI Prompt</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select which data sources the AI should use to build the ICP AI Prompt and generate research.
              </p>
            </div>
            <div className="space-y-2.5">
              {([
                { key: "location" as const, label: "Location", desc: "Target countries, states, cities, and radii" },
                { key: "propertyProfile" as const, label: "Property Profile", desc: "Room counts, ADR, occupancy, financial targets" },
                { key: "propertyDescription" as const, label: "Property Description", desc: "Property types, F&B levels, exclusions" },
                { key: "questions" as const, label: "Questions", desc: "Research questions defined above" },
                { key: "additionalInstructions" as const, label: "Additional Instructions", desc: "Custom instructions written above" },
                { key: "financialResults" as const, label: "Financial Results", desc: "Current financial reports for the Management Company" },
              ]).map((item) => (
                <div key={item.key} className="flex items-start gap-2.5">
                  <Checkbox
                    id={`ctx-${item.key}`}
                    checked={h.promptBuilder.context[item.key]}
                    onCheckedChange={(v) => h.handleContextChange(item.key, !!v)}
                    className="mt-0.5"
                    data-testid={`checkbox-context-${item.key}`}
                  />
                  <label htmlFor={`ctx-${item.key}`} className="cursor-pointer leading-tight">
                    <span className="text-xs font-medium text-foreground">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground block">{item.desc}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {h.activeSubTab === "icp-ai-prompt" && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">ICP AI Research Prompt</h4>
            <p className="text-xs text-muted-foreground mt-1">
              This prompt is generated from your AI Prompt configuration and served to the AI research engine.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="default" onClick={h.handleGenerate} disabled={h.updateMutation.isPending} className="text-xs h-8 gap-1.5" data-testid="button-generate-prompt">
              <IconRefreshCw className="w-3.5 h-3.5" />
              Generate
            </Button>
            {!h.isEditing ? (
              <Button size="sm" variant="outline" onClick={h.handleEdit} disabled={!h.prompt} className="text-xs h-8 gap-1.5" data-testid="button-edit-prompt">
                <IconPencil className="w-3.5 h-3.5" />
                Edit
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="default" onClick={h.handleSaveEdit} disabled={h.updateMutation.isPending} className="text-xs h-8 gap-1.5" data-testid="button-save-edit">
                  Save Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={h.handleCancelEdit} className="text-xs h-8" data-testid="button-cancel-edit">
                  Cancel
                </Button>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={h.handleOptimize} disabled={h.isOptimizing || (!h.prompt && !h.editablePrompt)} className="text-xs h-8 gap-1.5" data-testid="button-optimize-prompt">
              {h.isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IconWand2 className="w-3.5 h-3.5" />}
              Optimize
            </Button>
            <Button size="sm" variant="ghost" onClick={h.handleCopy} disabled={!h.prompt && !h.editablePrompt} className="text-xs h-8 gap-1.5" data-testid="button-copy-prompt">
              <IconCopy className="w-3.5 h-3.5" />
              {h.copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="ghost" onClick={h.handleClear} disabled={!h.prompt || h.updateMutation.isPending} className="text-xs h-8 gap-1.5 text-destructive hover:text-destructive" data-testid="button-clear-prompt">
              <IconTrash className="w-3.5 h-3.5" />
              Clear
            </Button>
          </div>

          {h.isEditing ? (
            <textarea
              value={h.editablePrompt}
              onChange={(e) => h.setEditablePrompt(e.target.value)}
              className="w-full min-h-[500px] text-xs leading-relaxed font-mono text-foreground/90 bg-muted/40 border border-border rounded p-4 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="textarea-ai-prompt"
            />
          ) : h.prompt ? (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono text-foreground/90 bg-muted/40 border border-border rounded p-4 max-h-[600px] overflow-y-auto" data-testid="text-ai-prompt">
              {h.prompt}
            </pre>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <IconSparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No ICP AI prompt generated yet</p>
              <p className="text-xs mt-1">Click <strong>Generate</strong> to build the prompt from your AI Prompt configuration.</p>
            </div>
          )}

          {(h.isEditing ? h.editablePrompt : h.prompt) && (
            <p className="text-xs text-muted-foreground italic">
              {(h.isEditing ? h.editablePrompt : h.prompt).length.toLocaleString()} characters
            </p>
          )}
        </div>
      )}

      {h.activeSubTab === "research-text" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <IconFlaskConical className="w-4 h-4 text-muted-foreground" />
                Research Text
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Formatted market research with charts and metrics. Export as PDF.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={h.handleGenerateResearch} disabled={h.isGenerating} className="text-xs h-8 gap-1.5" data-testid="button-generate-research">
                {h.isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IconRefreshCw className="w-3.5 h-3.5" />}
                {h.isGenerating ? "Generating..." : h.report ? "Regenerate" : "Generate Research"}
              </Button>
            </div>
          </div>

          {h.isGenerating && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing markets and generating report...</span>
              </div>
              <div ref={h.streamRef} className="max-h-[500px] overflow-y-auto bg-muted/40 border border-border rounded-lg p-4 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap" data-testid="stream-content">
                {h.streamContent || "Waiting for response..."}
              </div>
            </div>
          )}

          {!h.isGenerating && !h.report && (
            <div className="text-center py-12">
              <IconFlaskConical className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-no-research">No research report generated yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click <strong>Generate Research</strong> to produce a market analysis.</p>
            </div>
          )}

          {!h.isGenerating && h.report && (
            <div className="space-y-6" data-testid="research-report">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">
                  Generated {new Date(h.report.generatedAt).toLocaleString()} using {h.report.model}
                </p>
                <div className="flex items-center gap-2">
                  <Select value={h.exportFormat} onValueChange={(v: "pdf" | "docx") => h.setExportFormat(v)}>
                    <SelectTrigger className="h-8 w-24 text-xs bg-card" data-testid="select-export-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="docx">DOCX</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={h.exportOrientation} onValueChange={(v: "portrait" | "landscape") => h.setExportOrientation(v)}>
                    <SelectTrigger className="h-8 w-28 text-xs bg-card" data-testid="select-export-orientation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={h.handleExport} disabled={h.isExporting} className="text-xs h-8 gap-1.5" data-testid="button-export-research">
                    {h.isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IconDownload className="w-3.5 h-3.5" />}
                    Export
                  </Button>
                </div>
              </div>

              {h.report.sections.map((section, idx) => (
                <div key={idx} className="space-y-2" data-testid={`section-${idx}`}>
                  <h3 className="text-sm font-semibold text-foreground border-b border-border/60 pb-1">{section.title}</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {section.content.split("\n\n").filter(Boolean).map((para, pi) => (
                      <p key={pi} className="text-xs leading-relaxed text-foreground/85 mb-2 last:mb-0">{para}</p>
                    ))}
                  </div>
                </div>
              ))}

              {h.report.extractedMetrics && Object.keys(h.report.extractedMetrics).length > 0 && (
                <div className="space-y-3" data-testid="extracted-metrics">
                  <h3 className="text-sm font-semibold text-foreground border-b border-border/60 pb-1">Key Extracted Metrics</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(h.report.extractedMetrics)
                      .filter(([k]) => k !== "locationMetrics")
                      .map(([key, val]) => {
                        const formatted = h.formatMetricValue(val);
                        if (!formatted) return null;
                        return (
                          <div key={key} className="bg-muted/40 rounded-lg p-3 border border-border/40" data-testid={`metric-${key}`}>
                            <p className="text-lg font-bold text-foreground">{formatted}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{val.description || key}</p>
                          </div>
                        );
                      })}
                  </div>

                  {h.report.extractedMetrics.locationMetrics && Array.isArray(h.report.extractedMetrics.locationMetrics) && (
                    <div className="space-y-3">
                      {h.report.extractedMetrics.locationMetrics.map((loc: any, li: number) => (
                        <div key={li} className="bg-muted/30 rounded-lg p-3 border border-border/40" data-testid={`location-metric-${li}`}>
                          <h4 className="text-xs font-semibold text-foreground mb-2">{loc.location}</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              ["ADR", loc.avgAdr], ["Occupancy", loc.avgOccupancy], ["RevPAR", loc.avgRevPAR],
                              ["Cap Rate", loc.capRate], ["Land/Acre", loc.avgLandCostPerAcre], ["Demand Growth", loc.demandGrowthRate],
                            ].map(([label, metric]) => {
                              const formatted = h.formatMetricValue(metric);
                              if (!formatted) return null;
                              return (
                                <div key={label as string} className="text-center">
                                  <p className="text-sm font-bold text-foreground">{formatted}</p>
                                  <p className="text-[10px] text-muted-foreground">{label as string}</p>
                                </div>
                              );
                            })}
                            {loc.competitiveIntensity && (
                              <div className="text-center">
                                <p className="text-sm font-bold text-foreground capitalize">{loc.competitiveIntensity}</p>
                                <p className="text-[10px] text-muted-foreground">Competition</p>
                              </div>
                            )}
                            {loc.investmentRating && (
                              <div className="text-center">
                                <p className="text-sm font-bold text-foreground">{loc.investmentRating}</p>
                                <p className="text-[10px] text-muted-foreground">Rating</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {h.activeSubTab === "research-markdown" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <IconFileText className="w-4 h-4 text-muted-foreground" />
                Research Markdown
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Raw markdown output from the AI research engine. Export as .md file.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={h.handleGenerateResearch} disabled={h.isGenerating} className="text-xs h-8 gap-1.5" data-testid="button-regenerate-markdown">
                {h.isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IconRefreshCw className="w-3.5 h-3.5" />}
                {h.isGenerating ? "Generating..." : h.researchMarkdown ? "Regenerate" : "Generate"}
              </Button>
              <Button size="sm" variant="outline" onClick={h.handleExportMarkdown} disabled={!h.researchMarkdown} className="text-xs h-8 gap-1.5" data-testid="button-export-markdown">
                <IconDownload className="w-3.5 h-3.5" />
                Export .md
              </Button>
            </div>
          </div>

          {h.isGenerating && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating markdown research report...</span>
              </div>
              <div ref={h.streamRef} className="max-h-[500px] overflow-y-auto bg-muted/40 border border-border rounded-lg p-4 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap" data-testid="stream-markdown">
                {h.streamContent || "Waiting for response..."}
              </div>
            </div>
          )}

          {!h.isGenerating && !h.researchMarkdown && (
            <div className="text-center py-12">
              <IconFileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground" data-testid="text-no-markdown">No markdown research generated yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click <strong>Generate</strong> to produce a markdown research report.</p>
            </div>
          )}

          {!h.isGenerating && h.researchMarkdown && (
            <div className="space-y-2" data-testid="research-markdown-content">
              <p className="text-xs text-muted-foreground">
                {h.researchMarkdown.length.toLocaleString()} characters
              </p>
              <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono text-foreground/90 bg-muted/40 border border-border rounded p-4 max-h-[700px] overflow-y-auto" data-testid="text-research-markdown">
                {h.researchMarkdown}
              </pre>
            </div>
          )}
        </div>
      )}

      {h.activeSubTab === "sources" && (
        <IcpSourcesPanel
          sources={h.sources}
          filteredUrls={h.filteredUrls}
          newUrl={h.newUrl} setNewUrl={h.setNewUrl}
          newLabel={h.newLabel} setNewLabel={h.setNewLabel}
          urlSearch={h.urlSearch} setUrlSearch={h.setUrlSearch}
          isUploading={h.isUploading} fileInputRef={h.fileInputRef}
          updateMutationPending={h.updateMutation.isPending}
          onAddUrl={h.handleAddUrl} onRemoveUrl={h.handleRemoveUrl}
          onLocalFileSelect={h.handleLocalFileSelect}
          onRemoveFile={h.handleRemoveFile}
          onToggleUnrestricted={(v) => {
            const updated = { ...h.sources, allowUnrestricted: v };
            h.setSources(updated);
            h.saveSources(updated);
          }}
        />
      )}
      </>)}
    </div>
  );
}
