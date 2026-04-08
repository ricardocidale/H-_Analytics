/**
 * RebeccaTab.tsx — Admin configuration for the Rebecca text chatbot.
 *
 * Allows admins to:
 *   • Enable/disable Rebecca
 *   • Set display name
 *   • Customize system prompt
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSave, IconMessageCircle } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_PROMPT = `You are Rebecca, the sharpest analyst at H+ Analytics. You know the portfolio inside out — every property's ADR, every cap rate assumption, every USALI line item. You have opinions about this work, backed by quiet confidence from watching the data compound.`;

export default function RebeccaTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: global, isLoading } = useQuery({
    queryKey: ["globalAssumptions"],
    queryFn: async () => {
      const res = await fetch("/api/global-assumptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [displayName, setDisplayName] = useState("Rebecca");
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    if (global) {
      setEnabled(global.rebeccaEnabled ?? false);
      setDisplayName(global.rebeccaDisplayName ?? "Rebecca");
      setSystemPrompt(global.rebeccaSystemPrompt ?? "");
    }
  }, [global]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/global-assumptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rebeccaEnabled: enabled,
          rebeccaDisplayName: displayName || "Rebecca",
          rebeccaSystemPrompt: systemPrompt || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
      toast({ title: "Saved", description: "Rebecca configuration updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconMessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Rebecca — Text Chat Agent</CardTitle>
              <CardDescription className="label-text">
                Norfolk AI-powered property analysis chatbot. Answers questions about portfolio financials using pre-computed metrics.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
            <div>
              <Label className="text-sm font-medium">Enable Rebecca</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Show Rebecca in sidebar and header for all users</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rebecca-name" className="text-sm font-medium">Display Name</Label>
            <Input
              id="rebecca-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Rebecca"
              className="max-w-sm"
            />
            <p className="text-xs text-muted-foreground">Name shown in the sidebar and chat panel header</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rebecca-prompt" className="text-sm font-medium">System Prompt</Label>
            <Textarea
              id="rebecca-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={DEFAULT_PROMPT}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the default prompt. Portfolio data is always appended automatically.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconSave className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
