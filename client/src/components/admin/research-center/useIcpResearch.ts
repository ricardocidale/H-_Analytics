import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useGlobalAssumptions, useUpdateAdminConfig } from "@/lib/api";
import {
  type IcpConfig,
  type IcpDescriptive,
  type IcpLocation,
  type Priority,
  DEFAULT_ICP_CONFIG,
  DEFAULT_ICP_DESCRIPTIVE,
  generateIcpPrompt,
} from "../icp-config";
import type {
  IcpSources, PromptBuilderConfig, IcpResearchReport, UrlSource,
} from "./icp-types";
import {
  DEFAULT_PROMPT_BUILDER, DEFAULT_ICP_MGMT_QUESTIONS,
  DEFAULT_URL_SEEDS, DEFAULT_SOURCES,
} from "./icp-types";
import { isValidUrl } from "./research-shared";

export function useIcpResearch() {
  const { toast } = useToast();
  const { data: ga, refetch } = useGlobalAssumptions();
  const updateMutation = useUpdateAdminConfig();
  const seededRef = useRef(false);

  const [activeSubTab, setActiveSubTab] = useState<"ai-prompt" | "icp-ai-prompt" | "research-text" | "research-markdown" | "sources">("ai-prompt");
  const [sources, setSources] = useState<IcpSources>(DEFAULT_SOURCES);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [urlSearch, setUrlSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [promptBuilder, setPromptBuilder] = useState<PromptBuilderConfig>(DEFAULT_PROMPT_BUILDER);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<IcpResearchReport | null>(null);
  const [researchMarkdown, setResearchMarkdown] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx">("pdf");
  const [exportOrientation, setExportOrientation] = useState<"portrait" | "landscape">("portrait");
  const [isExporting, setIsExporting] = useState(false);

  const config = (ga?.icpConfig as IcpConfig) || DEFAULT_ICP_CONFIG;
  const desc: IcpDescriptive = (() => {
    if (ga?.icpConfig && (ga.icpConfig as any)?._descriptive) {
      return { ...DEFAULT_ICP_DESCRIPTIVE, ...((ga.icpConfig as any)._descriptive as Partial<IcpDescriptive>) };
    }
    return DEFAULT_ICP_DESCRIPTIVE;
  })();
  const propertyLabel = ga?.propertyLabel || "Boutique Hotel";
  const promptOpts = {
    locations: ((ga?.icpConfig as any)?._locations ?? []) as IcpLocation[],
    customAmenities: ((ga?.icpConfig as any)?._customAmenities ?? []) as { label: string; priority: Priority }[],
  };
  const prompt = (ga?.assetDescription as string) || "";

  useEffect(() => {
    if (ga?.icpConfig) {
      const cfg = ga.icpConfig as Record<string, any>;
      if (cfg._research) setReport(cfg._research as IcpResearchReport);
      if (cfg._researchMarkdown) setResearchMarkdown(cfg._researchMarkdown as string);
      if (cfg._promptBuilder) {
        setPromptBuilder({ ...DEFAULT_PROMPT_BUILDER, ...(cfg._promptBuilder as Partial<PromptBuilderConfig>) });
      }
    }
  }, [ga?.icpConfig]);

  useEffect(() => {
    if (!ga) return;
    if (seededRef.current || updateMutation.isPending) return;
    const cfg = (ga.icpConfig as Record<string, any>) || {};

    const needSourcesSeed = !cfg._sources;
    const savedPb = cfg._promptBuilder as Partial<PromptBuilderConfig> | undefined;
    const needQuestionsSeed = !savedPb || !Array.isArray(savedPb.questions) || savedPb.questions.length === 0;

    if (cfg._sources) {
      setSources(cfg._sources as IcpSources);
    }

    if (!needSourcesSeed && !needQuestionsSeed) return;

    seededRef.current = true;
    const existing = { ...cfg };
    const messages: string[] = [];

    if (needSourcesSeed) {
      const seededSources: IcpSources = { urls: [...DEFAULT_URL_SEEDS], files: [] };
      setSources(seededSources);
      existing._sources = seededSources;
      messages.push("10 default research sources");
    }

    if (needQuestionsSeed) {
      const seededPb: PromptBuilderConfig = {
        ...DEFAULT_PROMPT_BUILDER,
        ...savedPb,
        questions: [...DEFAULT_ICP_MGMT_QUESTIONS],
      };
      setPromptBuilder(seededPb);
      existing._promptBuilder = seededPb;
      messages.push("11 default Industry Benchmark Ranges questions");
    }

    updateMutation.mutate(
      { icpConfig: existing },
      { onSuccess: () => { toast({ title: "Defaults Loaded", description: `${messages.join(" and ")} have been added.` }); } }
    );
  }, [ga?.icpConfig]);

  const saveSources = (updated: IcpSources) => {
    const existing = (ga?.icpConfig as Record<string, any>) || {};
    updateMutation.mutate(
      { icpConfig: { ...existing, _sources: updated } },
      { onSuccess: () => { toast({ title: "Saved", description: "Research sources updated." }); } }
    );
  };

  const mutateError = useCallback(() => {
    toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
  }, [toast]);

  const savePromptBuilder = useCallback((updated: PromptBuilderConfig) => {
    const existing = (ga?.icpConfig as Record<string, any>) || {};
    updateMutation.mutate(
      { icpConfig: { ...existing, _promptBuilder: updated } },
      { onSuccess: () => { toast({ title: "Saved", description: "Prompt builder configuration updated." }); }, onError: mutateError }
    );
  }, [ga?.icpConfig, updateMutation, toast, mutateError]);

  const handleAddQuestion = () => {
    const text = newQuestionText.trim();
    if (!text) return;
    const updated = { ...promptBuilder, questions: [...promptBuilder.questions, { id: `q-${Date.now()}`, question: text, sortOrder: promptBuilder.questions.length }] };
    setPromptBuilder(updated);
    setNewQuestionText("");
    savePromptBuilder(updated);
  };

  const handleEditQuestion = (id: string) => {
    const q = promptBuilder.questions.find((q) => q.id === id);
    if (!q) return;
    setEditingQuestionId(id);
    setEditingQuestionText(q.question);
  };

  const handleSaveEditQuestion = () => {
    if (!editingQuestionId || !editingQuestionText.trim()) return;
    const updated = { ...promptBuilder, questions: promptBuilder.questions.map((q) => q.id === editingQuestionId ? { ...q, question: editingQuestionText.trim() } : q) };
    setPromptBuilder(updated);
    setEditingQuestionId(null);
    setEditingQuestionText("");
    savePromptBuilder(updated);
  };

  const handleCopyQuestion = (id: string) => {
    const q = promptBuilder.questions.find((q) => q.id === id);
    if (!q) return;
    const updated = { ...promptBuilder, questions: [...promptBuilder.questions, { id: `q-${Date.now()}`, question: q.question, sortOrder: promptBuilder.questions.length }] };
    setPromptBuilder(updated);
    savePromptBuilder(updated);
    toast({ title: "Copied", description: "Question duplicated." });
  };

  const handleDeleteQuestion = (id: string) => {
    const updated = { ...promptBuilder, questions: promptBuilder.questions.filter((q) => q.id !== id) };
    setPromptBuilder(updated);
    savePromptBuilder(updated);
  };

  const handleReinsertDefaults = () => {
    const existingIds = new Set(promptBuilder.questions.map((q) => q.id));
    const missing = DEFAULT_ICP_MGMT_QUESTIONS.filter((dq) => !existingIds.has(dq.id));
    if (missing.length === 0) {
      toast({ title: "No Changes", description: "All default Industry Benchmark Ranges questions are already present." });
      return;
    }
    const nextOrder = promptBuilder.questions.length;
    const reinserted = missing.map((q, i) => ({ ...q, sortOrder: nextOrder + i }));
    const updated = { ...promptBuilder, questions: [...promptBuilder.questions, ...reinserted] };
    setPromptBuilder(updated);
    savePromptBuilder(updated);
    toast({ title: "Defaults Restored", description: `${missing.length} default question${missing.length > 1 ? "s" : ""} re-inserted.` });
  };

  const handleContextChange = (key: keyof PromptBuilderConfig["context"], checked: boolean) => {
    const updated = { ...promptBuilder, context: { ...promptBuilder.context, [key]: checked } };
    setPromptBuilder(updated);
    savePromptBuilder(updated);
  };

  const handleInstructionsChange = useCallback((value: string) => {
    setPromptBuilder((prev) => ({ ...prev, additionalInstructions: value }));
  }, []);

  const handleSaveInstructions = () => { savePromptBuilder(promptBuilder); };

  const handleGenerate = () => {
    const generated = generateIcpPrompt(config, desc, propertyLabel, promptOpts);
    updateMutation.mutate(
      { assetDescription: generated },
      {
        onSuccess: () => { setIsEditing(false); toast({ title: "Generated", description: "AI prompt generated from current profile and description." }); },
        onError: () => { toast({ title: "Error", description: "Failed to save generated prompt.", variant: "destructive" }); },
      }
    );
  };

  const handleEdit = () => { setEditablePrompt(prompt); setIsEditing(true); };

  const handleSaveEdit = () => {
    updateMutation.mutate(
      { assetDescription: editablePrompt },
      { onSuccess: () => { setIsEditing(false); toast({ title: "Saved", description: "AI prompt updated." }); }, onError: mutateError }
    );
  };

  const handleCancelEdit = () => { setIsEditing(false); setEditablePrompt(""); };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(isEditing ? editablePrompt : prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    updateMutation.mutate(
      { assetDescription: "" },
      { onSuccess: () => { setIsEditing(false); setEditablePrompt(""); toast({ title: "Cleared", description: "AI prompt cleared." }); }, onError: mutateError }
    );
  };

  const handleOptimize = async () => {
    const currentPrompt = isEditing ? editablePrompt : prompt;
    if (!currentPrompt.trim()) {
      toast({ title: "Nothing to optimize", description: "Generate or enter a prompt first.", variant: "destructive" });
      return;
    }
    setIsOptimizing(true);
    try {
      const res = await fetch("/api/ai/optimize-prompt", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ prompt: currentPrompt }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to optimize"); }
      const { optimized } = await res.json();
      updateMutation.mutate(
        { assetDescription: optimized },
        { onSuccess: () => { setIsEditing(false); toast({ title: "Optimized", description: "Prompt has been optimized by AI." }); }, onError: mutateError }
      );
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to optimize prompt", variant: "destructive" });
    } finally { setIsOptimizing(false); }
  };

  const handleGenerateResearch = useCallback(async () => {
    setIsGenerating(true);
    setStreamContent("");
    setReport(null);
    setResearchMarkdown("");
    try {
      const res = await fetch("/api/research/icp/generate", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ promptBuilder }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to start research generation"); }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "content") {
              setStreamContent((prev) => prev + event.data);
              if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
            } else if (event.type === "done" && event.report) {
              setReport(event.report);
              if (event.markdown) setResearchMarkdown(event.markdown);
              await refetch();
            } else if (event.type === "error") { throw new Error(event.message); }
          } catch { /* ignore: malformed SSE chunk — skip and continue stream */ }
        }
      }
      toast({ title: "Research Complete", description: "ICP Management Co market research report has been generated and saved." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to generate research", variant: "destructive" });
    } finally { setIsGenerating(false); }
  }, [refetch, toast, promptBuilder]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/research/icp/export", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ format: exportFormat, orientation: exportOrientation }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Export failed"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `icp-research-report.${exportFormat}`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `Report exported as ${exportFormat.toUpperCase()}.` });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Export failed", variant: "destructive" });
    } finally { setIsExporting(false); }
  };

  const handleExportMarkdown = () => {
    if (!researchMarkdown) return;
    const blob = new Blob([researchMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "icp-research-report.md"; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Research exported as Markdown." });
  };

  const formatMetricValue = (val: any) => {
    if (!val || typeof val !== "object" || !("value" in val)) return null;
    const v = val.value;
    const u = val.unit || "";
    if (u === "USD") return `$${Number(v).toLocaleString()}`;
    if (u === "%") return `${v}%`;
    return `${v} ${u}`.trim();
  };

  const handleAddUrl = () => {
    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl) return;
    if (!isValidUrl(trimmedUrl)) { toast({ title: "Invalid URL", description: "Please enter a valid URL starting with http:// or https://", variant: "destructive" }); return; }
    if (sources.urls.some((s) => s.url === trimmedUrl)) { toast({ title: "Duplicate", description: "This URL is already in your sources.", variant: "destructive" }); return; }
    const updated: IcpSources = { ...sources, urls: [...sources.urls, { id: `url-${Date.now()}`, url: trimmedUrl, label: newLabel.trim() || new URL(trimmedUrl).hostname, addedAt: new Date().toISOString() }] };
    setSources(updated); saveSources(updated); setNewUrl(""); setNewLabel("");
  };

  const handleRemoveUrl = (id: string) => {
    const updated: IcpSources = { ...sources, urls: sources.urls.filter((u) => u.id !== id) };
    setSources(updated); saveSources(updated);
  };

  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const newFiles: import("./icp-types").FileSource[] = [];
      for (const file of Array.from(files)) {
        const res = await fetch("/api/uploads/direct", { method: "POST", credentials: "include", headers: { "Content-Type": file.type || "application/octet-stream" }, body: await file.arrayBuffer().then((b) => new Uint8Array(b)) });
        let objectPath = "";
        if (res.ok) { const data = await res.json(); objectPath = data.url || data.objectPath || ""; }
        newFiles.push({ id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: file.name, size: file.size, type: file.type || "application/octet-stream", origin: "local", objectPath, addedAt: new Date().toISOString() });
      }
      const updated: IcpSources = { ...sources, files: [...sources.files, ...newFiles] };
      setSources(updated); saveSources(updated);
      toast({ title: "Files Added", description: `${newFiles.length} file(s) added to research sources.` });
    } catch (err: unknown) {
      toast({ title: "Upload Error", description: err instanceof Error ? err.message : "Failed to upload files", variant: "destructive" });
    } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleRemoveFile = (id: string) => {
    const updated: IcpSources = { ...sources, files: sources.files.filter((f) => f.id !== id) };
    setSources(updated); saveSources(updated);
  };

  const filteredUrls = urlSearch.trim()
    ? sources.urls.filter((u) => u.url.toLowerCase().includes(urlSearch.toLowerCase()) || u.label.toLowerCase().includes(urlSearch.toLowerCase()))
    : sources.urls;

  return {
    activeSubTab, setActiveSubTab,
    promptBuilder, newQuestionText, setNewQuestionText,
    editingQuestionId, setEditingQuestionId, editingQuestionText, setEditingQuestionText,
    isEditing, editablePrompt, setEditablePrompt, copied, isOptimizing,
    isGenerating, streamContent, streamRef, report, researchMarkdown,
    exportFormat, setExportFormat, exportOrientation, setExportOrientation, isExporting,
    prompt, updateMutation,
    sources, newUrl, setNewUrl, newLabel, setNewLabel, urlSearch, setUrlSearch,
    isUploading, fileInputRef, filteredUrls,
    handleAddQuestion, handleEditQuestion, handleSaveEditQuestion, handleCopyQuestion,
    handleDeleteQuestion, handleReinsertDefaults, handleContextChange,
    handleInstructionsChange, handleSaveInstructions,
    handleGenerate, handleEdit, handleSaveEdit, handleCancelEdit,
    handleCopy, handleClear, handleOptimize,
    handleGenerateResearch, handleExport, handleExportMarkdown, formatMetricValue,
    handleAddUrl, handleRemoveUrl, handleLocalFileSelect, handleRemoveFile,
    saveSources, setSources,
  };
}
