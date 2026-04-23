/**
 * IdentityTab — Phase 3 (Task #453) admin-editable humanName + gender,
 * with catalog factory defaults clearly labelled and a "Restore default"
 * button that deletes the override row. The same surface is used by Gaspar
 * (id="gaspar") because the route family accepts the orchestrator id.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type IdentityGender = "male" | "female" | "neutral";

interface IdentityResponse {
  specialistId: string;
  catalog: { humanName: string; gender: IdentityGender };
  override: {
    humanName: string | null;
    gender: IdentityGender | null;
    updatedByUserId: number | null;
    updatedAt: string;
  } | null;
  resolved: {
    humanName: string;
    gender: IdentityGender;
    source: { humanName: "override" | "catalog"; gender: "override" | "catalog" };
  };
}

export function IdentityTab({ specialistId }: { specialistId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<IdentityResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}/identity`],
  });

  const [humanName, setHumanName] = useState<string>("");
  const [gender, setGender] = useState<IdentityGender>("female");
  const [changeSummary, setChangeSummary] = useState("");

  // Hydrate the form from the resolved view so the inputs always start at
  // "what is currently in effect" (override-when-present, catalog otherwise).
  useEffect(() => {
    if (data) {
      setHumanName(data.resolved.humanName);
      setGender(data.resolved.gender);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/identity`, {
        humanName,
        gender,
        changeSummary: changeSummary || undefined,
      });
      return res.json() as Promise<IdentityResponse>;
    },
    onSuccess: () => {
      toast({ title: "Identity saved", description: "Override active for this Specialist." });
      setChangeSummary("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/identity`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not save identity",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/specialists/${specialistId}/identity`, {
        changeSummary: changeSummary || undefined,
      });
      return res.json() as Promise<IdentityResponse>;
    },
    onSuccess: () => {
      toast({ title: "Restored to factory default", description: "Override row removed." });
      setChangeSummary("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/identity`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not reset identity",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card><CardContent className="py-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="destructive" data-testid="identity-error">
        <IconAlertTriangle className="w-4 h-4" />
        <AlertTitle>Could not load identity</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  const hasOverride = data.override !== null;
  const dirty =
    humanName !== data.resolved.humanName || gender !== data.resolved.gender;

  return (
    <Card data-testid="identity-tab">
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>
          The Specialist's persona name (used in narration, log lines, and the page header) and
          grammatical gender (used by the pronoun helper). The catalog supplies factory defaults;
          values you set here override the catalog for this Specialist only and propagate
          everywhere the engine references the persona.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded border p-3 bg-muted/30 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Catalog default</div>
            <div data-testid="identity-default-name">{data.catalog.humanName}</div>
            <div className="text-muted-foreground" data-testid="identity-default-gender">{data.catalog.gender}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">In effect</div>
            <div data-testid="identity-resolved-name">
              {data.resolved.humanName}
              {data.resolved.source.humanName === "override" && (
                <Badge variant="secondary" className="ml-2 text-xs">custom</Badge>
              )}
            </div>
            <div className="text-muted-foreground" data-testid="identity-resolved-gender">
              {data.resolved.gender}
              {data.resolved.source.gender === "override" && (
                <Badge variant="secondary" className="ml-2 text-xs">custom</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="identity-human-name">Persona name</Label>
          <Input
            id="identity-human-name"
            data-testid="input-identity-human-name"
            value={humanName}
            onChange={(e) => setHumanName(e.target.value)}
            maxLength={40}
          />
        </div>

        <div className="space-y-2">
          <Label>Gender (pronouns)</Label>
          <RadioGroup
            value={gender}
            onValueChange={(v) => setGender(v as IdentityGender)}
            className="flex gap-6"
          >
            {(["female", "male", "neutral"] as IdentityGender[]).map((g) => (
              <div key={g} className="flex items-center gap-2">
                <RadioGroupItem value={g} id={`identity-gender-${g}`} data-testid={`radio-identity-gender-${g}`} />
                <Label htmlFor={`identity-gender-${g}`} className="capitalize cursor-pointer">{g}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="identity-change-summary">Change summary (optional)</Label>
          <Input
            id="identity-change-summary"
            data-testid="input-identity-change-summary"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="e.g. corrected spelling per legal review"
            maxLength={500}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            data-testid="button-identity-save"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save override
          </Button>
          <Button
            variant="outline"
            data-testid="button-identity-reset"
            onClick={() => resetMutation.mutate()}
            disabled={!hasOverride || resetMutation.isPending}
          >
            Restore default
          </Button>
        </div>

        {hasOverride && data.override && (
          <div className="text-xs text-muted-foreground border-t pt-3" data-testid="identity-audit-footer">
            Override last updated {new Date(data.override.updatedAt).toLocaleString()}
            {data.override.updatedByUserId != null && ` by user #${data.override.updatedByUserId}`}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
