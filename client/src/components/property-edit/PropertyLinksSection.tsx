import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Badge } from "@/components/ui/badge";
import { IconPlus, IconTrash } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { useToast } from "@/hooks/use-toast";
import type { PropertyUrl } from "@shared/schema";

interface PropertyLinksSectionProps {
  propertyId: number;
}

function domainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function statusBadge(u: PropertyUrl) {
  if (u.isValid === null || u.isValid === undefined) {
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0" data-testid={`badge-unchecked-${u.id}`}>Unchecked</Badge>;
  }
  if (!u.isValid) {
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`badge-broken-${u.id}`}>Broken</Badge>;
  }
  if (u.isRelevant) {
    return <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground" data-testid={`badge-relevant-${u.id}`}>Relevant</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`badge-valid-${u.id}`}>Valid</Badge>;
}

export default function PropertyLinksSection({ propertyId }: PropertyLinksSectionProps) {
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: urls = [], isLoading } = useQuery<PropertyUrl[]>({
    queryKey: ["propertyUrls", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/urls`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch URLs");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: { url: string; label?: string }) => {
      const res = await fetch(`/api/properties/${propertyId}/urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to add URL");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["propertyUrls", propertyId] });
      setNewUrl("");
      setNewLabel("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (urlId: number) => {
      const res = await fetch(`/api/properties/${propertyId}/urls/${urlId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete URL");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["propertyUrls", propertyId] });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/urls/validate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to validate URLs");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["propertyUrls", propertyId] });
      const valid = data.results?.filter((r: any) => r.isValid).length ?? 0;
      toast({ title: "Validation complete", description: `${valid}/${data.validated} URLs are reachable` });
    },
    onError: (err: Error) => {
      toast({ title: "Validation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch { return; }
    addMutation.mutate({ url: trimmed, label: newLabel.trim() || undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const isValidUrl = (() => {
    if (!newUrl.trim()) return true;
    try { new URL(newUrl.trim()); return true; } catch { return false; }
  })();

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm" data-testid="section-property-links">
      <div className="relative p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-display text-foreground">Property Links</h3>
            <p className="text-muted-foreground text-sm label-text">
              External URLs for listings, maps, reviews, and property references
            </p>
          </div>
          {urls.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
              data-testid="button-validate-urls"
            >
              {validateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <span className="mr-1.5">🔍</span>
              )}
              {validateMutation.isPending ? "Validating…" : "Validate All"}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {urls.map((u) => (
              <div key={u.id} className="flex items-center gap-2 group" data-testid={`property-url-row-${u.id}`}>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {statusBadge(u)}
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate"
                    data-testid={`property-url-link-${u.id}`}
                    title={u.url}
                  >
                    {u.label || domainLabel(u.url)}
                  </a>
                  {u.label && (
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                      {domainLabel(u.url)}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(u.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-url-${u.id}`}
                >
                  <IconTrash className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-end gap-2 pt-1">
              <div className="flex-1 space-y-2">
                <Label className="label-text text-foreground flex items-center gap-1.5">
                  Add Link
                  <InfoTooltip text="Paste any URL related to this property — listings (Airbnb, VRBO), maps, review sites, or broker pages. Use the Validate button to check reachability and auto-tag relevance." />
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="https://www.airbnb.com/rooms/..."
                    className={`flex-1 bg-card border-primary/30 text-foreground placeholder:text-muted-foreground ${!isValidUrl ? "border-destructive" : ""}`}
                    data-testid="input-property-url"
                  />
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Label (optional)"
                    className="w-40 bg-card border-primary/30 text-foreground placeholder:text-muted-foreground"
                    data-testid="input-property-url-label"
                  />
                </div>
                {!isValidUrl && (
                  <p className="text-xs text-destructive">Please enter a valid URL</p>
                )}
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={handleAdd}
                disabled={!newUrl.trim() || !isValidUrl || addMutation.isPending}
                className="shrink-0"
                data-testid="button-add-property-url"
              >
                {addMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                ) : (
                  <IconPlus className="w-4 h-4 mr-1.5" />
                )}
                Add
              </Button>
            </div>
          </div>
        )}

        {!isLoading && urls.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No property links added yet. Add external URLs to listings, maps, or review sites.
          </div>
        )}
      </div>
    </div>
  );
}
