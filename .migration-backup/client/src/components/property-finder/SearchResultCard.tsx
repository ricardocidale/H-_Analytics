/**
 * SearchResultCard.tsx — A single AI-generated property search result.
 *
 * When the user runs a Property Finder search, the LLM returns structured
 * data for potential acquisition targets. Each result is rendered as a card
 * showing:
 *   • Property name, location, and type
 *   • Estimated room count, ADR, and purchase price
 *   • A brief AI-generated narrative about the opportunity
 *   • A "Save" button that persists the result as a Favorite for later review
 *
 * Clicking "Import to Portfolio" on a saved favorite (FavoriteCard) creates
 * a real property in the database with these estimated values pre-filled.
 */
import { formatMoney } from "@/lib/financialEngine";
import { Button } from "@/components/ui/button";
import type { PropertyFinderResult } from "@/lib/api";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconHeart, IconExternalLink, IconBed, IconBath, IconRuler, IconTrees, IconMapPin, IconImage, IconTrendingUp } from "@/components/icons";

function PropertyTypeLabel(type: string | null): string {
  if (!type) return "";
  const map: Record<string, string> = {
    single_family: "Single Family",
    multi_family: "Multi-Family",
    farm: "Farm / Ranch",
    land: "Land",
  };
  return map[type] || type;
}

export function SearchResultCard({
  property,
  isSaved,
  isSaving,
  onToggleFavorite,
  expandedImage,
  onToggleImage,
  onShowValue,
  onShowDetail,
}: {
  property: PropertyFinderResult;
  isSaved: boolean;
  isSaving: boolean;
  onToggleFavorite: () => void;
  expandedImage: string | null;
  onToggleImage: (id: string) => void;
  onShowValue?: (id: string) => void;
  onShowDetail?: (property: PropertyFinderResult) => void;
}) {
  return (
    <div
      className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden hover:shadow-md transition-shadow group"
      data-testid={`row-property-${property.externalId}`}
    >
      <div className="h-0.5 bg-gradient-to-r from-primary to-primary/30" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2">
            <IconMapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-foreground font-medium text-sm leading-snug" data-testid={`text-address-${property.externalId}`}>
              {property.address}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {property.imageUrl && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onToggleImage(property.externalId)}
                data-testid={`btn-image-${property.externalId}`}
              >
                <IconImage className="w-4 h-4 text-primary" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFavorite}
              disabled={isSaving}
              title={isSaved ? "Remove from saved" : "Save property"}
              data-testid={`btn-favorite-${property.externalId}`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              ) : isSaved ? (
                <IconHeart className="w-4 h-4 text-destructive fill-destructive" />
              ) : (
                <IconHeart className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              )}
            </Button>
          </div>
        </div>

        {expandedImage === property.externalId && property.imageUrl && (
          <div className="mb-3 rounded-xl overflow-hidden">
            <img
              src={property.imageUrl}
              alt={property.address}
              className="w-full h-auto rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        <p className="text-xl font-bold text-foreground mb-3" data-testid={`text-price-${property.externalId}`}>
          {property.price ? formatMoney(property.price) : "—"}
        </p>

        <div className="flex flex-wrap items-center gap-4 py-2.5 px-3 bg-primary/5 rounded-xl border border-primary/10">
          <div className="flex items-center gap-1.5">
            <IconBed className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-foreground" data-testid={`text-beds-${property.externalId}`}>{property.beds ?? "—"} beds</span>
          </div>
          <div className="w-px h-4 bg-primary/20" />
          <div className="flex items-center gap-1.5">
            <IconBath className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-foreground" data-testid={`text-baths-${property.externalId}`}>{property.baths ?? "—"} baths</span>
          </div>
          <div className="w-px h-4 bg-primary/20" />
          <div className="flex items-center gap-1.5">
            <IconRuler className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-foreground" data-testid={`text-sqft-${property.externalId}`}>{property.sqft ? property.sqft.toLocaleString() : "—"} sqft</span>
          </div>
          <div className="w-px h-4 bg-primary/20" />
          <div className="flex items-center gap-1.5">
            <IconTrees className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-semibold text-secondary" data-testid={`text-acres-${property.externalId}`}>{property.lotSizeAcres ?? "—"} acres</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            {property.propertyType ? (
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-secondary border border-primary/20">
                {PropertyTypeLabel(property.propertyType)}
              </span>
            ) : <span />}
            {onShowValue && (
              <button
                onClick={() => onShowValue(property.externalId)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
                data-testid={`btn-value-history-${property.externalId}`}
              >
                <IconTrendingUp className="w-3 h-3" /> Value
              </button>
            )}
            {onShowDetail && (
              <button
                onClick={() => onShowDetail(property)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                data-testid={`btn-details-${property.externalId}`}
              >
                Details
              </button>
            )}
          </div>
          {property.listingUrl && (
            <a
              href={property.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-secondary flex items-center gap-1"
              data-testid={`link-listing-${property.externalId}`}
            >
              View Listing <IconExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
