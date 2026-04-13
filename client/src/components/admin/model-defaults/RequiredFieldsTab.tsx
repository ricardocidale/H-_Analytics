import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { useToast } from "@/hooks/use-toast";

interface FieldDef {
  key: string;
  label: string;
}

const FIELD_DEFS: FieldDef[] = [
  { key: "name", label: "Property Name" },
  { key: "location", label: "Location" },
  { key: "country", label: "Country" },
  { key: "roomCount", label: "Room Count" },
  { key: "startAdr", label: "Starting ADR" },
  { key: "startOccupancy", label: "Starting Occupancy" },
  { key: "purchasePrice", label: "Purchase Price" },
  { key: "qualityTier", label: "Quality Tier" },
  { key: "businessModel", label: "Business Model" },
  { key: "serviceLevel", label: "Service Level" },
  { key: "locationType", label: "Location Type" },
];

const DEFAULT_CONFIG: Record<string, boolean> = {
  name: true,
  location: true,
  roomCount: true,
  startAdr: true,
  purchasePrice: true,
  country: false,
  startOccupancy: false,
  qualityTier: false,
  businessModel: false,
  serviceLevel: false,
  locationType: false,
};

export function RequiredFieldsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Record<string, boolean>>(DEFAULT_CONFIG);
  const [isDirty, setIsDirty] = useState(false);

  const { data: savedConfig, isLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["admin", "required-fields"],
    queryFn: async () => {
      const res = await fetch("/api/admin/required-fields", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  useEffect(() => {
    if (savedConfig) {
      setConfig({ ...DEFAULT_CONFIG, ...savedConfig });
      setIsDirty(false);
    }
  }, [savedConfig]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, boolean>) => {
      const res = await fetch("/api/admin/required-fields", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "required-fields"] });
      toast({ title: "Required fields updated" });
      setIsDirty(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save required fields config.", variant: "destructive" });
    },
  });

  const toggleField = (key: string) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enabledCount = Object.values(config).filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Required Fields Before Research Can Run</CardTitle>
        <CardDescription>Toggle ON = field must have a value before AI research engines will process this property. {enabledCount} of {FIELD_DEFS.length} fields required.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {FIELD_DEFS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-muted/50 transition-colors" data-testid={`required-field-row-${key}`}>
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${config[key] ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <Switch
                checked={config[key] ?? false}
                onCheckedChange={() => toggleField(key)}
                data-testid={`switch-required-${key}`}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-6">
          <Button
            onClick={() => saveMutation.mutate(config)}
            disabled={!isDirty || saveMutation.isPending}
            data-testid="button-save-required-fields"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
