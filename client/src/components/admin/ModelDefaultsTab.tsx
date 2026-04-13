import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import { invalidateAllFinancialQueries } from "@/lib/api";
import type { AdminSaveState } from "@/components/admin/save-state";
import type { Draft } from "./model-defaults/FieldHelpers";
import { MarketMacroTab } from "./model-defaults/MarketMacroTab";
import { PropertyUnderwritingTab } from "./model-defaults/PropertyUnderwritingTab";
import { LlmDefaultsTab } from "./model-defaults/LlmDefaultsTab";
import { CompanyTab } from "./model-defaults/CompanyTab";
import { RequiredFieldsTab } from "./model-defaults/RequiredFieldsTab";

interface ModelDefaultsTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

export default function ModelDefaultsTab({ onSaveStateChange }: ModelDefaultsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: saved, isLoading } = useQuery({
    queryKey: ["globalAssumptions"],
    queryFn: async () => {
      const res = await fetch("/api/global-assumptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch global assumptions");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Draft) => {
      const res = await fetch("/api/global-assumptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...saved, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to save app defaults");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllFinancialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
      toast({ title: "App defaults saved", description: "Changes will apply to new entities. Existing properties retain their current values." });
      setIsDirty(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save app defaults.", variant: "destructive" });
    },
  });

  const [draft, setDraft] = useState<Draft>({});
  const [isDirty, setIsDirty] = useState(false);
  const draftRef = useRef<Draft>({});

  useEffect(() => {
    if (saved) {
      setDraft({ ...saved });
      draftRef.current = { ...saved };
      setIsDirty(false);
    }
  }, [saved]);

  const handleChange = useCallback((field: string, value: any) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      draftRef.current = next;
      return next;
    });
    setIsDirty(true);
  }, []);

  const saveRef = useRef<(() => void) | undefined>(undefined);
  saveRef.current = () => saveMutation.mutate(draftRef.current);

  useEffect(() => {
    onSaveStateChange?.({
      isDirty,
      isPending: saveMutation.isPending,
      onSave: () => saveRef.current?.(),
    });
    return () => onSaveStateChange?.(null);
  }, [isDirty, saveMutation.isPending, onSaveStateChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div data-testid="admin-app-defaults">
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border/60">
          <TabsTrigger value="company" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="market-macro" data-testid="tab-market-macro">Market & Macro</TabsTrigger>
          <TabsTrigger value="property-underwriting" data-testid="tab-property-underwriting">Property Underwriting</TabsTrigger>
          <TabsTrigger value="llm-defaults" data-testid="tab-llm-defaults">LLM Defaults</TabsTrigger>
          <TabsTrigger value="required-fields" data-testid="tab-required-fields">Required Fields</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanyTab draft={draft} onChange={handleChange} />
        </TabsContent>

        <TabsContent value="market-macro">
          <MarketMacroTab draft={draft} onChange={handleChange} />
        </TabsContent>

        <TabsContent value="property-underwriting">
          <PropertyUnderwritingTab draft={draft} onChange={handleChange} />
        </TabsContent>

        <TabsContent value="llm-defaults">
          <LlmDefaultsTab />
        </TabsContent>

        <TabsContent value="required-fields">
          <RequiredFieldsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
