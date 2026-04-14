import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Lock, Star } from "@/components/icons/themed-icons";
import { IconPlus, IconTrash, IconPencil, IconPalette } from "@/components/icons";
import { useDesignThemes, useCreateTheme, useUpdateTheme, useDeleteTheme } from "./useDesignThemes";
import { ThemePreview } from "./ThemePreview";
import type { DesignTheme } from "./types";
import { AppearanceDefaultsSection } from "./AppearanceDefaultsSection";
import { ThemeFormDialog, DeleteConfirmDialog, BLANK_THEME, type NewThemeState } from "./ThemeFormDialog";

function softenHex(hex: string, factor = 0.75): string {
  const h = hex.replace(/^#/, "");
  const parse = (i: number) => parseInt(h.slice(i, i + 2), 16) || 0;
  const [r, g, b] = [0, 2, 4].map(parse);
  const s = (c: number) => Math.min(255, Math.round(c + (255 - c) * factor));
  return `#${[r, g, b].map(s).map(c => c.toString(16).padStart(2, "0")).join("")}`;
}

export function ThemeManager() {
  const { data: designThemes, isLoading: themesLoading } = useDesignThemes();
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<DesignTheme | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [newTheme, setNewTheme] = useState<NewThemeState>(BLANK_THEME);

  const createThemeMutation = useCreateTheme({
    onSuccess: () => {
      setThemeDialogOpen(false);
      setNewTheme(BLANK_THEME);
    },
  });
  const updateThemeMutation = useUpdateTheme({
    onSuccess: () => {
      setEditingTheme(null);
    },
  });
  const deleteThemeMutation = useDeleteTheme();

  const activeTheme = designThemes?.find(t => t.isDefault);

  const sortedThemes = [...(designThemes ?? [])].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    return a.name.localeCompare(b.name);
  });

  const defaultTab = activeTheme ? String(activeTheme.id) : sortedThemes[0] ? String(sortedThemes[0].id) : "";

  const themeForForm = editingTheme ?? newTheme;
  const setThemeForForm = (val: typeof themeForForm) => {
    if (editingTheme) setEditingTheme(val as DesignTheme);
    else setNewTheme(val as NewThemeState);
  };

  return (
    <>
    {activeTheme && (
      <Card className="relative overflow-hidden bg-card/80 backdrop-blur-xl border-2 border-primary/30 shadow-lg mb-6" data-testid="current-theme-card">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/8 blur-[80px] animate-pulse" style={{ animationDuration: '5s' }} />
        </div>
        <CardHeader className="relative pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <IconPalette className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-display text-foreground">Current Theme</CardTitle>
              <CardDescription className="label-text text-muted-foreground">{activeTheme.name}{activeTheme.description ? ` — ${activeTheme.description}` : ''}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          {activeTheme.colors.filter(c => c.description?.startsWith('PALETTE:')).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Palette</p>
              <div className="flex gap-2 flex-wrap">
                {activeTheme.colors.filter(c => c.description?.startsWith('PALETTE:')).sort((a, b) => a.rank - b.rank).map((color, idx) => (
                  <div key={`active-palette-${idx}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                    <div className="w-7 h-7 rounded-md border border-border shadow-inner" style={{ backgroundColor: color.hexCode }} />
                    <div>
                      <p className="text-xs font-medium text-foreground">{color.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{color.hexCode}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTheme.colors.filter(c => c.description?.startsWith('CHART:')).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Charts</p>
              <div className="flex gap-1.5 flex-wrap">
                {activeTheme.colors.filter(c => c.description?.startsWith('CHART:')).sort((a, b) => a.rank - b.rank).map((color, idx) => (
                  <div key={`active-chart-${idx}`} className="group relative">
                    <div className="w-8 h-8 rounded-md border border-border shadow-inner cursor-default" style={{ backgroundColor: color.hexCode }} title={`${color.name}: ${color.hexCode}`} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTheme.colors.filter(c => c.description?.startsWith('EXPORT:')).length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Exports</p>
              <div className="flex gap-2 flex-wrap">
                {activeTheme.colors.filter(c => c.description?.startsWith('EXPORT:')).map((color, idx) => {
                  const pale = softenHex(color.hexCode);
                  return (
                    <div key={`active-export-${idx}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted border border-border">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded border border-border/60 opacity-40" style={{ backgroundColor: color.hexCode }} title={`Base: ${color.hexCode}`} />
                        <span className="text-[9px] text-muted-foreground">→</span>
                        <div className="w-7 h-7 rounded-md border border-border shadow-inner" style={{ backgroundColor: pale }} title={`In exports: ${pale}`} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">{color.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{pale}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeTheme.colors.filter(c => !c.description?.startsWith('PALETTE:') && !c.description?.startsWith('CHART:') && !c.description?.startsWith('EXPORT:')).length > 0 && activeTheme.colors.filter(c => c.description?.startsWith('PALETTE:')).length === 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Colors</p>
              <div className="flex gap-2 flex-wrap">
                {activeTheme.colors.filter(c => !c.description?.startsWith('PALETTE:') && !c.description?.startsWith('CHART:') && !c.description?.startsWith('EXPORT:')).sort((a, b) => a.rank - b.rank).map((color, idx) => (
                  <div key={`active-other-${idx}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                    <div className="w-7 h-7 rounded-md border border-border shadow-inner" style={{ backgroundColor: color.hexCode }} />
                    <div>
                      <p className="text-xs font-medium text-foreground">{color.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{color.hexCode}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )}

    <div className="mb-6">
      <ThemePreview themeName={activeTheme?.name} />
    </div>

    <AppearanceDefaultsSection />

    <Card className="relative overflow-hidden bg-card/80 backdrop-blur-xl border border-border shadow-2xl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-primary/10 blur-[100px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-secondary/10 blur-[100px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
      </div>
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-display text-foreground">All Themes</CardTitle>
            <CardDescription className="label-text text-muted-foreground">
              Select, preview, and manage your design themes
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setThemeDialogOpen(true)} data-testid="button-new-theme">
            <IconPlus className="w-4 h-4" />
            New Theme
          </Button>
        </div>
      </CardHeader>

      <CardContent className="relative">
        {themesLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto text-muted-foreground animate-spin" />
          </div>
        ) : sortedThemes.length > 0 ? (
          <Tabs defaultValue={defaultTab}>
            <TabsList className="flex w-full h-auto flex-wrap gap-1 bg-muted/50 p-1.5 mb-6 rounded-xl">
              {sortedThemes.map(theme => (
                <TabsTrigger
                  key={theme.id}
                  value={String(theme.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm"
                  data-testid={`tab-theme-${theme.id}`}
                >
                  <span className="truncate max-w-[120px]">{theme.name}</span>
                  {theme.isDefault && <Star className="w-3 h-3 text-primary shrink-0" />}
                  {theme.isSystem && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                </TabsTrigger>
              ))}
            </TabsList>

            {sortedThemes.map(theme => (
              <TabsContent key={theme.id} value={String(theme.id)} className="mt-0">
                <div className="space-y-5">
                  {/* Theme header + actions */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-lg font-semibold text-foreground">{theme.name}</h3>
                          {theme.isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary text-primary-foreground">
                              <Star className="w-2.5 h-2.5" /> Active
                            </span>
                          )}
                          {theme.isSystem && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-muted text-muted-foreground border border-border">
                              <Lock className="w-2.5 h-2.5" /> Built-in
                            </span>
                          )}
                        </div>
                        {theme.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{theme.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!theme.isDefault && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateThemeMutation.mutate({ id: theme.id, data: { isDefault: true } })}
                          disabled={updateThemeMutation.isPending}
                          data-testid={`button-activate-${theme.id}`}
                        >
                          <Star className="w-3.5 h-3.5 mr-1" />
                          Set as Default
                        </Button>
                      )}
                      {!theme.isSystem && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTheme(theme)}
                          data-testid={`button-edit-${theme.id}`}
                        >
                          <IconPencil className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                      )}
                      {!theme.isSystem && !theme.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteConfirmId(theme.id)}
                          data-testid={`button-delete-${theme.id}`}
                        >
                          <IconTrash className="w-3.5 h-3.5 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Status notices */}
                  {theme.isSystem && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/60 border border-border text-sm text-muted-foreground">
                      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>This is a built-in system theme. You can activate it as the default, but it cannot be edited or deleted.</span>
                    </div>
                  )}
                  {!theme.isSystem && theme.isDefault && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
                      <Star className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                      <span>This is the currently active theme. To delete it, first activate a different theme.</span>
                    </div>
                  )}

                  {/* Color swatches */}
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {theme.colors.filter(c => c.description?.startsWith('PALETTE:')).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Palette</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {theme.colors.filter(c => c.description?.startsWith('PALETTE:')).sort((a, b) => a.rank - b.rank).map((color, idx) => (
                            <div key={`palette-${idx}`} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border/50">
                              <div className="w-5 h-5 rounded border border-border/60 shrink-0" style={{ backgroundColor: color.hexCode }} />
                              <span className="text-[10px] text-foreground font-medium">{color.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {theme.colors.filter(c => c.description?.startsWith('CHART:')).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Charts</p>
                        <div className="flex gap-1 flex-wrap">
                          {theme.colors.filter(c => c.description?.startsWith('CHART:')).sort((a, b) => a.rank - b.rank).map((color, idx) => (
                            <div
                              key={`chart-${idx}`}
                              className="w-6 h-6 rounded border border-border/60"
                              style={{ backgroundColor: color.hexCode }}
                              title={`${color.name}: ${color.hexCode}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {theme.colors.filter(c => c.description?.startsWith('EXPORT:')).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Exports</p>
                        <div className="flex gap-2 flex-wrap">
                          {theme.colors.filter(c => c.description?.startsWith('EXPORT:')).map((color, idx) => {
                            const pale = softenHex(color.hexCode);
                            return (
                              <div key={`export-${idx}`} className="flex items-center gap-1" title={`${color.name}: pale ${pale}`}>
                                <div className="w-3.5 h-3.5 rounded-sm border border-border/40 opacity-40" style={{ backgroundColor: color.hexCode }} />
                                <span className="text-[8px] text-muted-foreground">→</span>
                                <div className="w-5 h-5 rounded border border-border/60" style={{ backgroundColor: pale }} />
                                <span className="text-[10px] text-muted-foreground ml-0.5">{color.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <p className="text-center text-muted-foreground py-8">No themes found.</p>
        )}
      </CardContent>
    </Card>

    <ThemeFormDialog
      open={themeDialogOpen || !!editingTheme}
      onOpenChange={(open) => { if (!open) { setThemeDialogOpen(false); setEditingTheme(null); } }}
      editingTheme={editingTheme}
      themeForForm={themeForForm}
      setThemeForForm={setThemeForForm}
      onSave={() => {
        if (editingTheme) {
          updateThemeMutation.mutate({ id: editingTheme.id, data: { name: editingTheme.name, description: editingTheme.description, colors: editingTheme.colors } });
        } else {
          createThemeMutation.mutate(newTheme);
        }
      }}
      isSaving={createThemeMutation.isPending || updateThemeMutation.isPending}
    />

    <DeleteConfirmDialog
      deleteConfirmId={deleteConfirmId}
      onOpenChange={() => setDeleteConfirmId(null)}
      themeName={designThemes?.find(t => t.id === deleteConfirmId)?.name ?? ""}
      onDelete={() => {
        if (deleteConfirmId !== null) {
          deleteThemeMutation.mutate(deleteConfirmId, { onSuccess: () => setDeleteConfirmId(null) });
        }
      }}
      isPending={deleteThemeMutation.isPending}
    />
    </>
  );
}
