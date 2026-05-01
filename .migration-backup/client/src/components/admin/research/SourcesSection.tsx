import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "@/components/icons/themed-icons";
import { IconPlus, IconExternalLink, IconLibrary } from "@/components/icons";
import { RESEARCH_SOURCES } from "@shared/constants";

export function SourcesSection({
  customSources,
  onChange,
}: {
  customSources: { name: string; url?: string; category: string }[];
  onChange: (sources: { name: string; url?: string; category: string }[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCategory, setNewCategory] = useState("Hospitality");

  function add() {
    if (newName.trim() && newCategory.trim()) {
      onChange([...customSources, { name: newName.trim(), url: newUrl.trim() || undefined, category: newCategory.trim() }]);
      setNewName("");
      setNewUrl("");
    }
  }

  function remove(index: number) {
    onChange(customSources.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <IconLibrary className="w-4 h-4 text-primary" />
          System Curated Sources
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {RESEARCH_SOURCES.map((source) => (
            <div key={source.name} className="flex flex-col p-3 rounded-xl border border-border/50 bg-muted/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{source.name}</span>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider h-4">{source.category}</Badge>
              </div>
              {source.url && (
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  {source.url.replace("https://", "")}
                  <IconExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <IconPlus className="w-4 h-4 text-primary" />
          Custom Research Sources
        </Label>
        
        <div className="flex flex-wrap gap-3 items-end p-4 rounded-xl border border-dashed border-primary/20 bg-primary/5">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Source Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Local Planning Dept" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">URL (Optional)</Label>
            <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5 w-32">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Category</Label>
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Hospitality">Hospitality</SelectItem>
                <SelectItem value="Economics">Economics</SelectItem>
                <SelectItem value="Operations">Operations</SelectItem>
                <SelectItem value="Regulatory">Regulatory</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} size="sm" className="h-8 px-4" disabled={!newName.trim()}>
            Add Source
          </Button>
        </div>

        {customSources.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customSources.map((source, idx) => (
              <div key={`${source.name}-${idx}`} className="flex flex-col p-3 rounded-xl border border-primary/20 bg-white relative group">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(idx)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive h-6 w-6"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{source.name}</span>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wider h-4">{source.category}</Badge>
                </div>
                {source.url && (
                  <span className="text-[10px] text-muted-foreground truncate pr-6">{source.url}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
