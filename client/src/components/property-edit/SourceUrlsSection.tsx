import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconPlus, IconTrash, IconPlay } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";

interface SourceUrlsSectionProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  onRunResearch: () => void;
  isGenerating: boolean;
}

export default function SourceUrlsSection({ urls, onChange, onRunResearch, isGenerating }: SourceUrlsSectionProps) {
  const [newUrl, setNewUrl] = useState("");

  const addUrl = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      return;
    }
    if (urls.includes(trimmed)) return;
    onChange([...urls, trimmed]);
    setNewUrl("");
  };

  const removeUrl = (index: number) => {
    onChange(urls.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUrl();
    }
  };

  const isValidUrl = (() => {
    if (!newUrl.trim()) return true;
    try {
      new URL(newUrl.trim());
      return true;
    } catch {
      return false;
    }
  })();

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-display text-foreground">Source URLs</h3>
            <p className="text-muted-foreground text-sm label-text">
              Reference links for property listings, photos, maps, and amenity details
            </p>
          </div>
          {urls.length > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={onRunResearch}
              disabled={isGenerating}
              data-testid="button-extract-from-urls"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <IconPlay className="w-4 h-4 mr-1.5" />
              )}
              {isGenerating ? "Extracting…" : "Research from URLs"}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {urls.map((url, idx) => (
            <div key={idx} className="flex items-center gap-2 group" data-testid={`source-url-row-${idx}`}>
              <div className="flex-1 min-w-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate block"
                  data-testid={`source-url-link-${idx}`}
                >
                  {url}
                </a>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                onClick={() => removeUrl(idx)}
                data-testid={`button-remove-url-${idx}`}
              >
                <IconTrash className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1 space-y-2">
              <Label className="label-text text-foreground flex items-center gap-1.5">
                Add URL
                <InfoTooltip text="Paste a link to a property listing, map, review site, or other reference. The research engine can extract photos, location, amenities, and other details from these sources." />
              </Label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://www.airbnb.com/rooms/..."
                className={`bg-card border-primary/30 text-foreground placeholder:text-muted-foreground ${!isValidUrl ? "border-destructive" : ""}`}
                data-testid="input-source-url"
              />
              {!isValidUrl && (
                <p className="text-xs text-destructive">Please enter a valid URL</p>
              )}
            </div>
            <Button
              variant="outline"
              size="default"
              onClick={addUrl}
              disabled={!newUrl.trim() || !isValidUrl}
              className="shrink-0"
              data-testid="button-add-url"
            >
              <IconPlus className="w-4 h-4 mr-1.5" />
              Add
            </Button>
          </div>
        </div>

        {urls.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No source URLs added yet. Add links to property listings, maps, or review sites to enrich your research.
          </div>
        )}
      </div>
    </div>
  );
}
