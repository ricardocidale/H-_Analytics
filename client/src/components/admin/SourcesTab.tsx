import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconTarget, IconProperties, IconTrendingUp, IconLink,
  IconUpload, IconPlus, IconTrash, IconPencil, IconGlobe,
  IconFileText,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useResearchConfig, useSaveResearchConfig } from "@/lib/api/admin";
import type { ResearchConfig, ResearchSourceFile } from "@shared/schema";
import { normalizeResearchConfig } from "./research-center/research-shared";
import type { AdminSaveState } from "./save-state";

type SourceCategory = "management-company" | "properties" | "general-marketing";

interface SourcesTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

const CATEGORIES: { key: SourceCategory; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { key: "management-company", label: "Management Company", icon: IconTarget, description: "Sources for ICP management company research" },
  { key: "properties", label: "Properties", icon: IconProperties, description: "Sources for individual property research" },
  { key: "general-marketing", label: "General Marketing", icon: IconTrendingUp, description: "Sources for broad market and hospitality intelligence" },
];

function generateId() {
  return `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function SourceCard({
  source,
  onEdit,
  onDelete,
}: {
  source: ResearchSourceFile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isUrl = source.type === "url";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors group" data-testid={`source-item-${source.id}`}>
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        {isUrl ? <IconLink className="w-4 h-4 text-primary" /> : <IconFileText className="w-4 h-4 text-accent" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{source.name}</p>
        {isUrl && source.url && (
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">{source.url}</a>
        )}
        {!isUrl && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{source.origin === "google-drive" ? "Google Drive" : "Local upload"}</span>
            {source.fileSize && <span>{(source.fileSize / 1024).toFixed(0)} KB</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} data-testid={`button-edit-source-${source.id}`} aria-label={`Edit ${source.name}`}>
          <IconPencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/80 hover:text-destructive/60" onClick={onDelete} data-testid={`button-delete-source-${source.id}`} aria-label={`Delete ${source.name}`}>
          <IconTrash className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CategoryPanel({
  category,
  sources,
  onAddUrl,
  onAddFile,
  onEditSource,
  onDeleteSource,
}: {
  category: typeof CATEGORIES[number];
  sources: ResearchSourceFile[];
  onAddUrl: () => void;
  onAddFile: (file: File) => void;
  onEditSource: (source: ResearchSourceFile) => void;
  onDeleteSource: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urls = sources.filter(s => s.type === "url");
  const files = sources.filter(s => s.type === "file");

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <category.icon className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm font-display">{category.label}</CardTitle>
        </div>
        <CardDescription className="text-xs">{category.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <IconLink className="w-3.5 h-3.5 text-muted-foreground" />
              <Label className="text-xs font-medium">URL Links</Label>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{urls.length}</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onAddUrl} data-testid={`button-add-url-${category.key}`}>
              <IconPlus className="w-3 h-3" />
              Add URL
            </Button>
          </div>
          {urls.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">No URL sources added yet</p>
          ) : (
            <div className="space-y-1.5">
              {urls.map(s => <SourceCard key={s.id} source={s} onEdit={() => onEditSource(s)} onDelete={() => onDeleteSource(s.id)} />)}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <IconUpload className="w-3.5 h-3.5 text-muted-foreground" />
              <Label className="text-xs font-medium">Uploaded Files</Label>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{files.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAddFile(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => fileInputRef.current?.click()} data-testid={`button-upload-file-${category.key}`}>
                <IconUpload className="w-3 h-3" />
                Upload File
              </Button>
            </div>
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">No files uploaded yet</p>
          ) : (
            <div className="space-y-1.5">
              {files.map(s => <SourceCard key={s.id} source={s} onEdit={() => onEditSource(s)} onDelete={() => onDeleteSource(s.id)} />)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SourcesTab({ onSaveStateChange }: SourcesTabProps) {
  const { toast } = useToast();
  const { data: savedConfig, isLoading } = useResearchConfig();
  const saveMutation = useSaveResearchConfig();

  const [draft, setDraft] = useState<ResearchConfig>({});
  const [isDirty, setIsDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<ResearchSourceFile | null>(null);
  const [dialogCategory, setDialogCategory] = useState<SourceCategory>("management-company");
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");

  useEffect(() => {
    if (savedConfig && !initialized) {
      setDraft(normalizeResearchConfig(savedConfig));
      setInitialized(true);
    }
  }, [savedConfig, initialized]);

  // Ref-based save handler to avoid infinite re-render loop (see admin-save-state rule)
  const saveRef = useRef<(() => void) | undefined>(undefined);
  saveRef.current = () => {
    saveMutation.mutate(draft, {
      onSuccess: () => {
        setIsDirty(false);
        toast({ title: "Sources saved" });
      },
      onError: () => {
        toast({ title: "Failed to save", variant: "destructive" });
      },
    });
  };

  useEffect(() => {
    if (!onSaveStateChange) return;
    if (!isDirty) {
      onSaveStateChange(null);
      return;
    }
    onSaveStateChange({
      isDirty: true,
      isPending: saveMutation.isPending,
      onSave: () => saveRef.current?.(),
    });
    return () => onSaveStateChange(null);
  }, [isDirty, saveMutation.isPending, onSaveStateChange]);

  const sourceFiles = draft.sourceFiles ?? [];
  const getSourcesForCategory = (cat: SourceCategory) => sourceFiles.filter(s => s.category === cat);

  const updateSources = (newFiles: ResearchSourceFile[]) => {
    const updated = { ...draft, sourceFiles: newFiles };
    setDraft(updated);
    setIsDirty(true);
  };

  const handleAddUrl = (cat: SourceCategory) => {
    setEditingSource(null);
    setDialogCategory(cat);
    setFormName("");
    setFormUrl("");
    setDialogOpen(true);
  };

  const handleEditSource = (source: ResearchSourceFile) => {
    setEditingSource(source);
    setDialogCategory(source.category);
    setFormName(source.name);
    setFormUrl(source.url || "");
    setDialogOpen(true);
  };

  const handleSaveDialog = () => {
    if (!formName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editingSource) {
      const updated = sourceFiles.map(s =>
        s.id === editingSource.id ? { ...s, name: formName.trim(), url: formUrl.trim() || undefined } : s
      );
      updateSources(updated);
    } else {
      const newSource: ResearchSourceFile = {
        id: generateId(),
        name: formName.trim(),
        type: "url",
        url: formUrl.trim() || undefined,
        category: dialogCategory,
        addedAt: new Date().toISOString(),
      };
      updateSources([...sourceFiles, newSource]);
    }
    setDialogOpen(false);
    setIsDirty(true);
  };

  const handleAddFile = (cat: SourceCategory, file: File) => {
    const newSource: ResearchSourceFile = {
      id: generateId(),
      name: file.name,
      type: "file",
      fileSize: file.size,
      origin: "local",
      category: cat,
      addedAt: new Date().toISOString(),
    };
    updateSources([...sourceFiles, newSource]);
    toast({ title: `Added file: ${file.name}` });
  };

  const handleDeleteSource = (id: string) => {
    updateSources(sourceFiles.filter(s => s.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconGlobe className="w-4 h-4" />
        <span>Sources are organized by research domain and used by LLMs during research assignments.</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {CATEGORIES.map(cat => (
          <CategoryPanel
            key={cat.key}
            category={cat}
            sources={getSourcesForCategory(cat.key)}
            onAddUrl={() => handleAddUrl(cat.key)}
            onAddFile={(file) => handleAddFile(cat.key, file)}
            onEditSource={handleEditSource}
            onDeleteSource={handleDeleteSource}
          />
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editingSource ? "Edit Source" : "Add URL Source"}</DialogTitle>
            <DialogDescription className="text-xs">
              {editingSource ? "Update the source details" : `Add a URL source for ${CATEGORIES.find(c => c.key === dialogCategory)?.label}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm"><IconFileText className="w-4 h-4 text-muted-foreground" />Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., STR Global Data" data-testid="input-source-name" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm"><IconLink className="w-4 h-4 text-muted-foreground" />URL</Label>
              <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://example.com/data" data-testid="input-source-url" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-source">Cancel</Button>
            <Button onClick={handleSaveDialog} disabled={!formName.trim()} data-testid="button-save-source">
              {editingSource ? "Update" : "Add Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
