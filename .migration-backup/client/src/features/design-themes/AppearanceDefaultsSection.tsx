import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Sun, Moon, Monitor, Sparkles } from "lucide-react";

type ColorModeDefault = "light" | "auto" | "dark";
type BgAnimationDefault = "enabled" | "auto" | "disabled";
type FontPreferenceDefault = "default" | "sans" | "system" | "dyslexic";

interface AppearanceDefaults {
  defaultColorMode: ColorModeDefault | null;
  defaultBgAnimation: BgAnimationDefault | null;
  defaultFontPreference: FontPreferenceDefault | null;
}

export function AppearanceDefaultsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: defaults, isLoading } = useQuery<AppearanceDefaults>({
    queryKey: ["appearance-defaults"],
    queryFn: async () => {
      const res = await fetch("/api/appearance-defaults", { credentials: "include" });
      if (!res.ok) return { defaultColorMode: null, defaultBgAnimation: null, defaultFontPreference: null };
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: Partial<AppearanceDefaults>) => {
      const res = await fetch("/api/appearance-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appearance-defaults"] });
      toast({ title: "Defaults Updated", description: "Organization appearance defaults have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update appearance defaults.", variant: "destructive" });
    },
  });

  if (isLoading) return null;

  const colorMode = defaults?.defaultColorMode ?? "light";
  const bgAnimation = defaults?.defaultBgAnimation ?? "auto";
  const fontPref = defaults?.defaultFontPreference ?? "default";

  return (
    <Card className="relative overflow-hidden bg-card/80 backdrop-blur-xl border border-border shadow-sm mb-6" data-testid="appearance-defaults-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-display text-foreground">Appearance Defaults</CardTitle>
            <CardDescription className="label-text text-muted-foreground">
              Set organization-wide defaults for color mode, animation, and font. Users inherit these unless they customize their own.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-foreground text-sm font-medium">Color Mode</Label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "light" as ColorModeDefault, label: "Light", icon: Sun, preview: "bg-white border-border" },
              { value: "auto" as ColorModeDefault, label: "Auto", icon: Monitor, preview: "bg-gradient-to-r from-white to-zinc-800 border-border" },
              { value: "dark" as ColorModeDefault, label: "Dark", icon: Moon, preview: "bg-zinc-900 border-zinc-700" },
            ]).map(({ value, label, icon: Icon, preview }) => {
              const active = colorMode === value;
              return (
                <button
                  key={value}
                  data-testid={`default-color-${value}`}
                  onClick={() => mutation.mutate({ defaultColorMode: value })}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <div className={`w-full h-12 rounded-lg ${preview}`} />
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-foreground text-sm font-medium">App Font</Label>
          <div className="grid grid-cols-4 gap-3">
            {([
              { value: "default" as FontPreferenceDefault, label: "Default", family: "'Inter', sans-serif" },
              { value: "sans" as FontPreferenceDefault, label: "Sans", family: "'DM Sans', sans-serif" },
              { value: "system" as FontPreferenceDefault, label: "System", family: "-apple-system, BlinkMacSystemFont, sans-serif" },
              { value: "dyslexic" as FontPreferenceDefault, label: "Dyslexic", family: "'OpenDyslexic', 'Comic Sans MS', sans-serif" },
            ]).map(({ value, label, family }) => {
              const active = fontPref === value;
              return (
                <button
                  key={value}
                  data-testid={`default-font-${value}`}
                  onClick={() => mutation.mutate({ defaultFontPreference: value })}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <span className="text-2xl font-semibold" style={{ fontFamily: family }}>Aa</span>
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-foreground text-sm font-medium">Background Animation</Label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "enabled" as BgAnimationDefault, label: "Enabled", icon: Sparkles },
              { value: "auto" as BgAnimationDefault, label: "Auto", icon: Monitor },
              { value: "disabled" as BgAnimationDefault, label: "Disabled", icon: null },
            ]).map(({ value, label, icon: Icon }) => {
              const active = bgAnimation === value;
              return (
                <button
                  key={value}
                  data-testid={`default-anim-${value}`}
                  onClick={() => mutation.mutate({ defaultBgAnimation: value })}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <div className="w-full h-10 rounded-lg bg-muted flex items-center justify-center">
                    {Icon ? <Icon className="w-5 h-5 text-muted-foreground" /> : <span className="text-xs text-muted-foreground">Off</span>}
                  </div>
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
