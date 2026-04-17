import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronUp, ChevronDown, AlertTriangle } from "@/components/icons/themed-icons";
import { IconPlus, IconTrash, IconPalette, IconActivity, IconSparkles, IconType, IconSave } from "@/components/icons";
import { ColorPicker } from "@/components/ui/color-picker";
import type { DesignTheme, DesignColor } from "./types";

export type NewThemeState = { name: string; description: string; colors: DesignColor[] };

export const BLANK_THEME: NewThemeState = {
  name: "",
  description: "",
  colors: [{ rank: 1, name: "", hexCode: "#000000", description: "" }],
};

function softenHex(hex: string, factor = 0.75): string {
  const h = hex.replace(/^#/, "");
  const parse = (i: number) => parseInt(h.slice(i, i + 2), 16) || 0;
  const [r, g, b] = [0, 2, 4].map(parse);
  const s = (c: number) => Math.min(255, Math.round(c + (255 - c) * factor));
  return `#${[r, g, b].map(s).map(c => c.toString(16).padStart(2, "0")).join("")}`;
}

interface ThemeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTheme: DesignTheme | null;
  themeForForm: NewThemeState | DesignTheme;
  setThemeForForm: (val: NewThemeState | DesignTheme) => void;
  onSave: () => void;
  isSaving: boolean;
}

export function ThemeFormDialog({ open, onOpenChange, editingTheme, themeForForm, setThemeForForm, onSave, isSaving }: ThemeFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTheme ? "Edit Theme" : "Create New Theme"}</DialogTitle>
          <DialogDescription>
            {editingTheme ? "Update this theme's colors and settings." : "Define a new color palette and design system."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="flex items-center gap-2 mb-1"><IconType className="w-4 h-4 text-muted-foreground" />Theme Name</Label>
            <Input
              value={themeForForm.name}
              onChange={e => setThemeForForm({ ...themeForForm, name: e.target.value })}
              placeholder="e.g. Brand Classic"
              data-testid="input-theme-name"
            />
          </div>

          <div>
            <Label className="flex items-center gap-2 mb-1"><IconPalette className="w-4 h-4 text-muted-foreground" />Description</Label>
            <Textarea
              value={themeForForm.description}
              onChange={e => setThemeForForm({ ...themeForForm, description: e.target.value })}
              placeholder="Describe the design philosophy and inspiration..."
            />
          </div>

          <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between mb-3">
              <Label className="flex items-center gap-2"><IconPalette className="w-4 h-4 text-primary" />Palette Colors</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const palette = themeForForm.colors.filter(c => c.description?.startsWith('PALETTE:'));
                  const newColor = { rank: palette.length + 1, name: "", hexCode: "#9FBCA4", description: "PALETTE: " };
                  setThemeForForm({ ...themeForForm, colors: [...themeForForm.colors, newColor] });
                }}
              >
                <IconPlus className="w-3 h-3 mr-1" /> Add Palette Color
              </Button>
            </div>
            <div className="space-y-2">
              {themeForForm.colors
                .map((color, originalIdx) => ({ color, originalIdx }))
                .filter(({ color }) => color.description?.startsWith('PALETTE:'))
                .map(({ color, originalIdx }, displayIdx, arr) => {
                  const moveUp = () => {
                    if (displayIdx === 0) return;
                    const all = [...themeForForm.colors];
                    const prev = arr[displayIdx - 1].originalIdx;
                    [all[prev], all[originalIdx]] = [all[originalIdx], all[prev]];
                    setThemeForForm({ ...themeForForm, colors: all });
                  };
                  const moveDown = () => {
                    if (displayIdx === arr.length - 1) return;
                    const all = [...themeForForm.colors];
                    const next = arr[displayIdx + 1].originalIdx;
                    [all[originalIdx], all[next]] = [all[next], all[originalIdx]];
                    setThemeForForm({ ...themeForForm, colors: all });
                  };
                  return (
                    <div key={originalIdx} className="p-3 rounded-lg border border-border bg-card space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-0.5">
                          <Button type="button" variant="ghost" size="icon" aria-label="Move color up" onClick={moveUp} disabled={displayIdx === 0} className={`h-auto w-auto p-0.5 ${displayIdx === 0 ? 'opacity-30' : ''}`}>
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label="Move color down" onClick={moveDown} disabled={displayIdx === arr.length - 1} className={`h-auto w-auto p-0.5 ${displayIdx === arr.length - 1 ? 'opacity-30' : ''}`}>
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                        <Input value={color.name} onChange={e => { const c = [...themeForForm.colors]; c[originalIdx] = { ...c[originalIdx], name: e.target.value }; setThemeForForm({ ...themeForForm, colors: c }); }} placeholder="Color name" className="flex-1" />
                        <div className="w-36">
                          <ColorPicker value={color.hexCode} onChange={nc => { const c = [...themeForForm.colors]; c[originalIdx] = { ...c[originalIdx], hexCode: nc }; setThemeForForm({ ...themeForForm, colors: c }); }} />
                        </div>
                        <Button type="button" size="sm" variant="ghost" aria-label="Remove color" className="text-destructive hover:text-destructive" onClick={() => setThemeForForm({ ...themeForForm, colors: themeForForm.colors.filter((_, i) => i !== originalIdx) })}>
                          <IconTrash className="w-4 h-4" />
                        </Button>
                      </div>
                      <Input value={color.description?.replace('PALETTE: ', '') || ''} onChange={e => { const c = [...themeForForm.colors]; c[originalIdx] = { ...c[originalIdx], description: 'PALETTE: ' + e.target.value }; setThemeForForm({ ...themeForForm, colors: c }); }} placeholder="Where to use this color..." className="text-sm" />
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="p-4 rounded-lg border-2 border-accent/30 bg-accent/5">
            <div className="flex items-center justify-between mb-3">
              <Label className="flex items-center gap-2"><IconActivity className="w-4 h-4 text-accent" />Chart Colors</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const charts = themeForForm.colors.filter(c => c.description?.startsWith('CHART:'));
                  const newColor = { rank: charts.length + 1, name: "", hexCode: "#3B82F6", description: "CHART: " };
                  setThemeForForm({ ...themeForForm, colors: [...themeForForm.colors, newColor] });
                }}
              >
                <IconPlus className="w-3 h-3 mr-1" /> Add Chart Color
              </Button>
            </div>
            <div className="space-y-2">
              {themeForForm.colors
                .map((color, originalIdx) => ({ color, originalIdx }))
                .filter(({ color }) => color.description?.startsWith('CHART:'))
                .map(({ color, originalIdx }, displayIdx, arr) => {
                  const moveUp = () => {
                    if (displayIdx === 0) return;
                    const all = [...themeForForm.colors];
                    const prev = arr[displayIdx - 1].originalIdx;
                    [all[prev], all[originalIdx]] = [all[originalIdx], all[prev]];
                    setThemeForForm({ ...themeForForm, colors: all });
                  };
                  const moveDown = () => {
                    if (displayIdx === arr.length - 1) return;
                    const all = [...themeForForm.colors];
                    const next = arr[displayIdx + 1].originalIdx;
                    [all[originalIdx], all[next]] = [all[next], all[originalIdx]];
                    setThemeForForm({ ...themeForForm, colors: all });
                  };
                  return (
                    <div key={originalIdx} className="p-3 rounded-lg border border-border bg-card space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-0.5">
                          <Button type="button" variant="ghost" size="icon" aria-label="Move chart color up" onClick={moveUp} disabled={displayIdx === 0} className={`h-auto w-auto p-0.5 ${displayIdx === 0 ? 'opacity-30' : ''}`}>
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label="Move chart color down" onClick={moveDown} disabled={displayIdx === arr.length - 1} className={`h-auto w-auto p-0.5 ${displayIdx === arr.length - 1 ? 'opacity-30' : ''}`}>
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                        <Input value={color.name} onChange={e => { const c = [...themeForForm.colors]; c[originalIdx] = { ...c[originalIdx], name: e.target.value }; setThemeForForm({ ...themeForForm, colors: c }); }} placeholder="Color name" className="flex-1" />
                        <div className="w-36">
                          <ColorPicker value={color.hexCode} onChange={nc => { const c = [...themeForForm.colors]; c[originalIdx] = { ...c[originalIdx], hexCode: nc }; setThemeForForm({ ...themeForForm, colors: c }); }} />
                        </div>
                        <Button type="button" size="sm" variant="ghost" aria-label="Remove chart color" className="text-destructive hover:text-destructive" onClick={() => setThemeForForm({ ...themeForForm, colors: themeForForm.colors.filter((_, i) => i !== originalIdx) })}>
                          <IconTrash className="w-4 h-4" />
                        </Button>
                      </div>
                      <Input value={color.description?.replace('CHART: ', '') || ''} onChange={e => { const c = [...themeForForm.colors]; c[originalIdx] = { ...c[originalIdx], description: 'CHART: ' + e.target.value }; setThemeForForm({ ...themeForForm, colors: c }); }} placeholder="What this color represents in charts..." className="text-sm" />
                    </div>
                  );
                })}
            </div>
          </div>

          {themeForForm.colors.filter(c => c.description?.startsWith('EXPORT:')).length > 0 && (
            <div className="p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
              <div className="mb-3">
                <Label className="flex items-center gap-2"><IconSparkles className="w-4 h-4 text-secondary-foreground/60" />Export Colors</Label>
                <p className="text-[11px] text-muted-foreground mt-1">These colors control how rows appear in PDF, PPTX, and Excel exports. The swatch shows how the color will appear after softening.</p>
              </div>
              <div className="space-y-2">
                {themeForForm.colors
                  .map((color, originalIdx) => ({ color, originalIdx }))
                  .filter(({ color }) => color.description?.startsWith('EXPORT:'))
                  .map(({ color, originalIdx }) => {
                    const pale = softenHex(color.hexCode);
                    return (
                      <div key={originalIdx} className="p-3 rounded-lg border border-border bg-card">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-foreground min-w-[90px]">{color.name}</span>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border/50 text-[10px] text-muted-foreground">
                            <span>Base</span>
                            <div className="w-4 h-4 rounded border border-border/60" style={{ backgroundColor: color.hexCode }} />
                            <span className="font-mono">{color.hexCode}</span>
                          </div>
                          <span className="text-muted-foreground text-xs">→</span>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border/50 text-[10px] text-muted-foreground">
                            <span>In exports</span>
                            <div className="w-4 h-4 rounded border border-border/60" style={{ backgroundColor: pale }} />
                            <span className="font-mono">{pale}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground flex-1">Change the base color — the export renderer softens it automatically.</span>
                          <div className="w-36">
                            <ColorPicker
                              value={color.hexCode}
                              onChange={nc => {
                                const c = [...themeForForm.colors];
                                c[originalIdx] = { ...c[originalIdx], hexCode: nc };
                                setThemeForForm({ ...themeForForm, colors: c });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
            {editingTheme ? "Save" : "Create Theme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteConfirmDialogProps {
  deleteConfirmId: number | null;
  onOpenChange: (open: boolean) => void;
  themeName: string;
  onDelete: () => void;
  isPending: boolean;
}

export function DeleteConfirmDialog({ deleteConfirmId, onOpenChange, themeName, onDelete, isPending }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={deleteConfirmId !== null} onOpenChange={open => { if (!open) onOpenChange(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Delete Theme
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{themeName}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onDelete} disabled={isPending}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconTrash className="w-4 h-4" />}
            Delete Theme
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
