/**
 * FavoriteCard.tsx — A saved prospective property from the Property Finder.
 *
 * After a user saves a search result, it becomes a "favorite" persisted in
 * the database. This card shows:
 *   • Property name, market, room count, and estimated ADR / purchase price
 *   • An "Import" button that creates a real portfolio property from the
 *     favorite's estimated values, pre-filling all financial assumptions
 *   • A delete button to remove the favorite
 *
 * Favorites bridge the gap between AI-generated research and the portfolio:
 * users can browse search results asynchronously, curate a shortlist, and
 * only import the most promising targets for full financial modeling.
 */
import { formatMoney } from "@/lib/financialEngine";
import { Button } from "@/components/ui/button";
import type { SavedProspectiveProperty } from "@/lib/api";
import { Loader2, X } from "@/components/icons/themed-icons";
import { IconExternalLink, IconBed, IconBath, IconRuler, IconTrees, IconMapPin, IconStickyNote, IconSave, IconTrash, IconTrendingUp, IconAlertTriangle, IconHistory } from "@/components/icons";
import {
  computePriceHistoryRollups,
  formatPriceHistoryChip,
  MOTIVATION_TIER_LABEL,
  type MotivationTier,
} from "@shared/price-history";

/**
 * Build the compact pricing chip ("-16.9% / 7mo") shown on the card.
 * Prefers the server-side roll-up columns on the favorite when present,
 * falls back to recomputing from the event log so we don't render stale
 * numbers if the columns weren't populated yet.
 */
function getChipFor(property: SavedProspectiveProperty): {
  chip: string | null;
  tier: MotivationTier;
  isStale: boolean;
} {
  const tier = (property.motivationTier ?? "firm") as MotivationTier;
  if (
    property.cumulativeDropPct != null ||
    property.currentDom != null ||
    (property.priceEvents && property.priceEvents.length > 0)
  ) {
    if (property.priceEvents && property.priceEvents.length > 0) {
      const r = computePriceHistoryRollups(property.priceEvents);
      return {
        chip: formatPriceHistoryChip(r),
        tier: r.motivationTier,
        isStale: r.isStale,
      };
    }
    return {
      chip: formatPriceHistoryChip({
        originalListPrice: property.originalListPrice ?? null,
        originalListDate: property.originalListDate ?? null,
        currentPrice: null,
        contractPrice: null,
        priorSalePrice: property.priorSalePrice ?? null,
        priorSaleDate: property.priorSaleDate ?? null,
        cumulativeDropAmount: null,
        cumulativeDropPct: property.cumulativeDropPct ?? null,
        currentDom: property.currentDom ?? null,
        relistCount: property.relistCount ?? 0,
        reductionCount: 0,
        isStale: (property.relistCount ?? 0) > 0,
        motivationTier: tier,
        lastEventAt: null,
      }),
      tier,
      isStale: (property.relistCount ?? 0) > 0,
    };
  }
  return { chip: null, tier, isStale: false };
}

const TIER_CHIP_CLASS: Record<MotivationTier, string> = {
  firm: "bg-muted/60 text-muted-foreground border-border",
  soft: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  motivated: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  distressed: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
};

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

export function FavoriteCard({
  property,
  onRemove,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onUpdateNotes,
  isRemoving,
  editingNotesId,
  notesText,
  onStartEditing,
  onNotesChange,
  onSaveNotes,
  onCancelEditing,
  onShowValue,
  onShowDetail,
}: {
  property: SavedProspectiveProperty;
  onRemove: (id: number) => void;
  onUpdateNotes: (id: number, notes: string) => void;
  isRemoving: boolean;
  editingNotesId: number | null;
  notesText: string;
  onStartEditing: (prop: SavedProspectiveProperty) => void;
  onNotesChange: (value: string) => void;
  onSaveNotes: (id: number) => void;
  onCancelEditing: () => void;
  onShowValue?: (externalId: string) => void;
  onShowDetail?: (property: SavedProspectiveProperty) => void;
}) {
  const { chip, tier, isStale } = getChipFor(property);
  return (
    <div
      className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden hover:shadow-md transition-shadow group"
      data-testid={`row-saved-${property.id}`}
    >
      <div className="h-0.5 bg-gradient-to-r from-primary to-primary/30" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2">
            <IconMapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-foreground font-medium text-sm leading-snug">{property.address}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(property.id)}
            disabled={isRemoving}
            title="Remove property"
            aria-label="Remove property"
            data-testid={`btn-remove-saved-${property.id}`}
          >
            {isRemoving ? (
              <Loader2 className="w-4 h-4 text-accent-pop animate-spin" />
            ) : (
              <IconTrash className="w-4 h-4 text-destructive/70 hover:text-destructive" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-xl font-bold text-foreground">
            {property.price ? formatMoney(property.price) : "—"}
          </p>
          {chip && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${TIER_CHIP_CLASS[tier]}`}
              title={`Acquisition pricing — Motivation: ${MOTIVATION_TIER_LABEL[tier]}`}
              data-testid={`chip-price-history-${property.id}`}
            >
              <IconHistory className="w-3 h-3" />
              {chip}
              {isStale && <IconAlertTriangle className="w-3 h-3 ml-0.5" />}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 py-2.5 px-3 bg-primary/5 rounded-xl border border-primary/10">
          <div className="flex items-center gap-1.5">
            <IconBed className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-foreground">{property.beds ?? "—"} beds</span>
          </div>
          <div className="w-px h-4 bg-primary/20" />
          <div className="flex items-center gap-1.5">
            <IconBath className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-foreground">{property.baths ?? "—"} baths</span>
          </div>
          <div className="w-px h-4 bg-primary/20" />
          <div className="flex items-center gap-1.5">
            <IconRuler className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-foreground">{property.sqft ? property.sqft.toLocaleString() : "—"} sqft</span>
          </div>
          <div className="w-px h-4 bg-primary/20" />
          <div className="flex items-center gap-1.5">
            <IconTrees className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-semibold text-secondary">{property.lotSizeAcres ?? "—"} acres</span>
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
              <Button
                variant="ghost"
                onClick={() => onShowValue(property.externalId)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1 h-auto"
                data-testid={`btn-value-history-saved-${property.id}`}
              >
                <IconTrendingUp className="w-3 h-3" /> Value
              </Button>
            )}
            {onShowDetail && (
              <Button
                variant="ghost"
                onClick={() => onShowDetail(property)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 h-auto"
                data-testid={`btn-details-saved-${property.id}`}
              >
                Details
              </Button>
            )}
          </div>
          {property.listingUrl && (
            <a
              href={property.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-secondary flex items-center gap-1"
              data-testid={`link-saved-listing-${property.id}`}
            >
              View Listing <IconExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Saved {new Date(property.savedAt).toLocaleDateString()}</span>
          </div>
          {editingNotesId === property.id ? (
            <div className="flex items-center gap-2">
              <input
                value={notesText}
                onChange={(e) => onNotesChange(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                placeholder="Add notes..."
                data-testid={`input-notes-${property.id}`}
                onKeyDown={(e) => e.key === "Enter" && onSaveNotes(property.id)}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSaveNotes(property.id)}
                className="text-primary"
                data-testid={`btn-save-notes-${property.id}`}
              >
                <IconSave className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onCancelEditing}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => onStartEditing(property)}
              className="text-xs text-muted-foreground hover:text-muted-foreground truncate w-full justify-start px-0"
              title={property.notes || "Click to add notes"}
              data-testid={`btn-edit-notes-${property.id}`}
            >
              <IconStickyNote className="w-3 h-3 inline mr-1" />
              {property.notes || <span className="italic">Add notes...</span>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
