import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconRefreshCw,
} from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface KBEntry {
  id: number;
  title: string;
  content: string;
  category: string;
  source: string;
  tags: string[];
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface KBHistory {
  id: number;
  entryId: number;
  snapshot: Record<string, unknown>;
  changedBy: string | null;
  createdAt: string;
}

interface KBStats {
  total: number;
  active: number;
  vectorCount: number;
  byCategory: Record<string, number>;
}

const CATEGORIES = ["all", "methodology", "hospitality", "financial", "faq", "custom"];
const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  methodology: "Methodology",
  hospitality: "Hospitality",
  financial: "Financial",
  faq: "FAQ",
  custom: "Custom",
};

export default function KnowledgeBaseEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("custom");
  const [newPriority, setNewPriority] = useState(50);
  const [newTags, setNewTags] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPriority, setEditPriority] = useState(50);
  const [editTags, setEditTags] = useState("");

  const { data: entries, isLoading } = useQuery<KBEntry[]>({
    queryKey: ["rebeccaKB", activeCategory],
    queryFn: async () => {
      const url = activeCategory === "all" ? "/api/rebecca/kb" : `/api/rebecca/kb?category=${activeCategory}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KB entries");
      return res.json();
    },
  });

  const { data: stats } = useQuery<KBStats>({
    queryKey: ["rebeccaKBStats"],
    queryFn: async () => {
      const res = await fetch("/api/rebecca/kb/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KB stats");
      return res.json();
    },
  });

  const { data: history } = useQuery<KBHistory[]>({
    queryKey: ["rebeccaKBHistory", historyId],
    queryFn: async () => {
      if (!historyId) return [];
      const res = await fetch(`/api/rebecca/kb/${historyId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: historyId !== null,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/rebecca/kb", {
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        source: "manual",
        priority: newPriority,
        tags: newTags.split(",").map(t => t.trim()).filter(Boolean),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebeccaKB"] });
      queryClient.invalidateQueries({ queryKey: ["rebeccaKBStats"] });
      setShowCreateForm(false);
      setNewTitle(""); setNewContent(""); setNewCategory("custom"); setNewPriority(50); setNewTags("");
      toast({ title: "KB entry created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<KBEntry> }) => {
      return apiRequest("PATCH", `/api/rebecca/kb/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebeccaKB"] });
      queryClient.invalidateQueries({ queryKey: ["rebeccaKBStats"] });
      setEditingId(null);
      toast({ title: "KB entry updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/rebecca/kb/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebeccaKB"] });
      queryClient.invalidateQueries({ queryKey: ["rebeccaKBStats"] });
      setDeletingId(null);
      toast({ title: "KB entry deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ entryId, hId }: { entryId: number; hId: number }) => {
      return apiRequest("POST", `/api/rebecca/kb/${entryId}/rollback/${hId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebeccaKB"] });
      queryClient.invalidateQueries({ queryKey: ["rebeccaKBHistory"] });
      setHistoryId(null);
      toast({ title: "KB entry restored to previous version" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleToggle = (entry: KBEntry) => {
    updateMutation.mutate({ id: entry.id, data: { isActive: !entry.isActive } });
  };

  const startEdit = (entry: KBEntry) => {
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditCategory(entry.category);
    setEditPriority(entry.priority);
    setEditTags((entry.tags ?? []).join(", "));
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: {
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
        priority: editPriority,
        tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
      },
    });
  };

  const filtered = (entries ?? []).filter(e => {
    if (statusFilter === "active" && !e.isActive) return false;
    if (statusFilter === "inactive" && e.isActive) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) ||
      (e.tags ?? []).some(t => t.toLowerCase().includes(q));
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Entries</p>
              <p className="text-xl font-bold text-foreground" data-testid="text-kb-total">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Active</p>
              <p className="text-xl font-bold text-primary" data-testid="text-kb-active">{stats.active}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vector Count</p>
              <p className="text-xl font-bold text-foreground" data-testid="text-kb-vectors">{stats.vectorCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Categories</p>
              <p className="text-xl font-bold text-foreground" data-testid="text-kb-categories">{Object.keys(stats.byCategory).length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="bg-muted/40 border border-border/40">
            {CATEGORIES.map(c => (
              <TabsTrigger key={c} value={c} className="text-xs" data-testid={`tab-kb-${c}`}>
                {CATEGORY_LABELS[c]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
          <SelectTrigger className="w-[110px] h-9 text-xs bg-card border-border" data-testid="select-kb-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="pl-9 h-9 text-xs bg-card border-border"
            data-testid="input-kb-search"
          />
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="gap-1.5"
          data-testid="button-create-kb"
        >
          <IconPlus className="w-3.5 h-3.5" />
          Add Entry
        </Button>
      </div>

      <AnimatePresence>
        {showCreateForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="bg-card border-primary/20 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">New Knowledge Base Entry</CardTitle>
                <CardDescription className="text-xs">Content will be embedded and synced to the vector store for retrieval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Title</Label>
                    <Input
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g. USALI Expense Categories"
                      className="text-sm bg-card border-border"
                      data-testid="input-kb-new-title"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Category</Label>
                      <Select value={newCategory} onValueChange={setNewCategory}>
                        <SelectTrigger className="bg-card border-border text-sm" data-testid="select-kb-new-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.filter(c => c !== "all").map(c => (
                            <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Priority (0-100)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={newPriority}
                        onChange={e => setNewPriority(parseInt(e.target.value) || 0)}
                        className="text-sm bg-card border-border"
                        data-testid="input-kb-new-priority"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Content</Label>
                  <Textarea
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    placeholder="Enter the knowledge base content..."
                    rows={5}
                    className="text-sm bg-card border-border"
                    data-testid="input-kb-new-content"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tags (comma-separated)</Label>
                  <Input
                    value={newTags}
                    onChange={e => setNewTags(e.target.value)}
                    placeholder="e.g. usali, expenses, hotel"
                    className="text-sm bg-card border-border"
                    data-testid="input-kb-new-tags"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)} data-testid="button-cancel-create-kb">Cancel</Button>
                  <Button
                    size="sm"
                    onClick={() => createMutation.mutate()}
                    disabled={!newTitle.trim() || !newContent.trim() || createMutation.isPending}
                    data-testid="button-save-create-kb"
                  >
                    {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                    Create Entry
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {historyId !== null && (
        <Card className="bg-card border-accent-pop/20 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Version History</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setHistoryId(null)} data-testid="button-close-history">Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            {!history || history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No version history available.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map(h => {
                  const snap = h.snapshot as Record<string, unknown>;
                  return (
                    <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{snap.title as string}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {h.changedBy ?? "System"} — {new Date(h.createdAt).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2">{(snap.content as string).slice(0, 120)}...</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs shrink-0"
                        onClick={() => rollbackMutation.mutate({ entryId: historyId, hId: h.id })}
                        disabled={rollbackMutation.isPending}
                        data-testid={`button-rollback-${h.id}`}
                      >
                        {rollbackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <IconRefreshCw className="w-3 h-3 mr-1" />}
                        Restore
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="bg-muted/10 border-border/40">
                <CardContent className="py-8 text-center">
                  <IconAlertTriangle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No entries found</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
          {filtered.map(entry => (
            <motion.div
              key={entry.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card
                className={cn(
                  "bg-card border shadow-sm transition-all duration-200",
                  entry.isActive ? "border-border/80" : "border-border/40 opacity-60"
                )}
                data-testid={`card-kb-${entry.id}`}
              >
                <CardContent className="py-4 px-5">
                  {editingId === entry.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          className="bg-card border-border font-medium text-sm"
                          data-testid={`input-edit-title-${entry.id}`}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <Select value={editCategory} onValueChange={setEditCategory}>
                            <SelectTrigger className="bg-card border-border text-sm" data-testid={`select-edit-category-${entry.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.filter(c => c !== "all").map(c => (
                                <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={editPriority}
                            onChange={e => setEditPriority(parseInt(e.target.value) || 0)}
                            className="bg-card border-border text-sm"
                            data-testid={`input-edit-priority-${entry.id}`}
                          />
                        </div>
                      </div>
                      <Textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={5}
                        className="bg-card border-border text-sm"
                        data-testid={`input-edit-content-${entry.id}`}
                      />
                      <Input
                        value={editTags}
                        onChange={e => setEditTags(e.target.value)}
                        placeholder="Tags (comma-separated)"
                        className="bg-card border-border text-sm"
                        data-testid={`input-edit-tags-${entry.id}`}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-${entry.id}`}>Cancel</Button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
                          disabled={!editTitle.trim() || !editContent.trim() || updateMutation.isPending}
                          data-testid={`button-save-edit-${entry.id}`}
                        >
                          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate">{entry.title}</p>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0 shrink-0",
                              entry.isActive
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {entry.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium border-border/60">
                            {CATEGORY_LABELS[entry.category] ?? entry.category}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground/50 font-mono">P{entry.priority}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{entry.content}</p>
                        {entry.tags && entry.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {entry.tags.map(tag => (
                              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch
                          checked={entry.isActive}
                          onCheckedChange={() => handleToggle(entry)}
                          data-testid={`switch-kb-${entry.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setHistoryId(historyId === entry.id ? null : entry.id)}
                          title="Version history"
                          data-testid={`button-history-${entry.id}`}
                        >
                          <IconRefreshCw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(entry)}
                          data-testid={`button-edit-kb-${entry.id}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </Button>
                        {deletingId === entry.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => deleteMutation.mutate(entry.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-confirm-delete-kb-${entry.id}`}
                            >
                              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setDeletingId(null)} data-testid={`button-cancel-delete-kb-${entry.id}`}>No</Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingId(entry.id)}
                            data-testid={`button-delete-kb-${entry.id}`}
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
