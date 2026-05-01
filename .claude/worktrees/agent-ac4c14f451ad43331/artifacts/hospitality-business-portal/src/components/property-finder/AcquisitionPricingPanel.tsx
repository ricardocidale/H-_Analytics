/**
 * AcquisitionPricingPanel.tsx — Acquisition Pricing pane on the
 * PropertyFinder target detail drawer.
 *
 * Renders the per-target price-history timeline driven by the shared
 * roll-up logic (`shared/price-history.ts`). The panel is intentionally
 * read-mostly: the only mutation surface is the inline "Add price event"
 * form so the team can capture observed listing movements as they come
 * in (broker email, portal change, MLS feed). Roll-ups (cumulative
 * drop %, current DOM, relist count, motivation tier) are recomputed
 * server-side on every write so this view, the card chip, the Analyst,
 * and any acquisition export quote the same numbers.
 *
 * Out of scope here: scraping the portals to populate events
 * automatically — that's a separate task. This panel is the manual
 * capture and reasoning surface.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  IconHistory,
  IconPlus,
  IconAlertTriangle,
  IconTrash,
} from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  usePriceEvents,
  useAddPriceEvent,
  useDeletePriceEvent,
} from "@/lib/api/research";
import {
  PRICE_EVENT_KINDS,
  PRICE_EVENT_KIND_LABEL,
  MOTIVATION_TIER_LABEL,
  MOTIVATION_TIER_RULE,
  formatPriceHistorySummary,
  type PriceEvent,
  type PriceEventKind,
  type MotivationTier,
} from "@shared/price-history";

interface Props {
  prospectiveId: number;
  /** Used as the placeholder fallback for the header subtitle. */
  address?: string;
}

const TIER_BADGE_CLASS: Record<MotivationTier, string> = {
  firm: "bg-muted text-muted-foreground border-border",
  soft: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  motivated: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  distressed: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
};

const KIND_DOT_CLASS: Record<PriceEventKind, string> = {
  prior_sale: "bg-muted-foreground/40",
  list: "bg-primary",
  reduction: "bg-amber-500",
  delist: "bg-muted-foreground/60",
  relist: "bg-secondary",
  contract: "bg-emerald-500",
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Per-event reduction magnitude shown on each `reduction` timeline row
 * (e.g. "(-7.4%)"). Computed locally so a row reads as "old → new (% drop)"
 * without round-tripping through the rollup math, which only computes the
 * cumulative drop across the whole timeline.
 */
function formatDropPct(oldPrice: number, newPrice: number): string {
  const pct = ((newPrice - oldPrice) / oldPrice) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function AcquisitionPricingPanel({ prospectiveId, address }: Props) {
  const { data, isLoading, error, refetch, isFetching } = usePriceEvents(prospectiveId);
  const addEvent = useAddPriceEvent(prospectiveId);
  const deleteEvent = useDeletePriceEvent(prospectiveId);
  const [formOpen, setFormOpen] = useState(false);
  const [analystRunning, setAnalystRunning] = useState(false);

  // Sort newest → oldest for display so the most recent movement is at the
  // top of the timeline; the underlying roll-up math is order-independent.
  const sortedEvents = useMemo<PriceEvent[]>(() => {
    if (!data?.events) return [];
    return [...data.events].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data?.events]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="pane-pricing">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8" data-testid="pane-pricing-error">
        <IconAlertTriangle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Could not load price history.</p>
      </div>
    );
  }

  const rollups = data?.rollups;
  const summary = rollups ? formatPriceHistorySummary(rollups) : null;
  const tier = (rollups?.motivationTier ?? "firm") as MotivationTier;

  return (
    <div className="space-y-4" data-testid="pane-pricing">
      {/* Header — title + Add Event affordance */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <IconHistory className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Acquisition Pricing</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {address ?? "Recorded listing movements for this target"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <AnalystActionButton
            variant="header"
            running={analystRunning || isFetching}
            onClick={async () => {
              // No price-history Specialist exists yet (follow-up #835 will
              // wire one). Until then the canonical Analyst affordance
              // re-pulls the timeline from the server so any out-of-band
              // events captured elsewhere become visible here.
              setAnalystRunning(true);
              try {
                await refetch();
              } finally {
                setAnalystRunning(false);
              }
            }}
            testIdSuffix="acquisition-pricing"
            tooltipText="Have the Analyst re-pull the listing timeline and recompute the motivation tier."
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFormOpen((v) => !v)}
            data-testid="btn-add-price-event"
            className="gap-1.5"
          >
            <IconPlus className="w-3.5 h-3.5" />
            {formOpen ? "Cancel" : "Add event"}
          </Button>
        </div>
      </div>

      {/* Inline add-event form */}
      {formOpen && (
        <AddEventForm
          submitting={addEvent.isPending}
          error={addEvent.error?.message}
          onSubmit={async (input) => {
            await addEvent.mutateAsync(input);
            setFormOpen(false);
          }}
        />
      )}

      {/*
        Always-rendered scaffold of `data-field` markers for the four
        roll-up dimensions registered in
        `engine/analyst/registry/field-registry.ts`. Placed at the top
        of the panel body so `useFocusFieldFromUrl()` lands the
        Analyst's "Adjust" CTA at the summary region regardless of
        whether the chips below have painted yet (the chips themselves
        are conditional on `usePriceEvents` resolving — gating the
        markers on that data would silently no-op the focus hook on
        the cold-load page state, which is the silent-failure class
        `analyst-field-registry-default-state-visibility.test.ts`
        catches).
      */}
      <div className="sr-only" aria-hidden="true" data-testid="scaffold-pricing-markers">
        <span data-field="cumulativeDropPct" />
        <span data-field="currentDom" />
        <span data-field="relistCount" />
        <span data-field="motivationTier" />
      </div>

      {/* Summary band — only shown once there's enough data to summarise. */}
      {summary && (
        <div
          className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5"
          data-testid="text-pricing-summary"
        >
          <p className="text-sm text-foreground leading-snug">{summary}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <MotivationBadge tier={tier} />
            {rollups?.isStale && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                data-testid="badge-stale-inventory"
              >
                <IconAlertTriangle className="w-3 h-3" />
                Stale inventory · {rollups.relistCount}× relisted
              </span>
            )}
            {rollups?.currentDom != null && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border border-border bg-muted/40 text-muted-foreground"
                data-testid="text-current-dom"
              >
                {rollups.currentDom} days on market
              </span>
            )}
          </div>
        </div>
      )}

      {/* Empty state — no events yet. */}
      {sortedEvents.length === 0 && (
        <div
          className="text-center py-8 rounded-xl border border-dashed border-border bg-muted/20"
          data-testid="empty-price-events"
        >
          <IconHistory className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No price events recorded yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Capture the original list, any reductions, delists, or a contract to build the timeline.
          </p>
        </div>
      )}

      {/* Timeline */}
      {sortedEvents.length > 0 && (
        <div className="space-y-2" data-testid="list-price-events">
          {sortedEvents.map((event) => (
            <TimelineRow
              key={event.id}
              event={event}
              onDelete={() => deleteEvent.mutate(event.id)}
              deleting={deleteEvent.isPending && deleteEvent.variables === event.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MotivationBadge({ tier }: { tier: MotivationTier }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border cursor-help ${TIER_BADGE_CLASS[tier]}`}
            data-testid={`badge-motivation-${tier}`}
            data-field="motivationTier"
          >
            Motivation: {MOTIVATION_TIER_LABEL[tier]}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs leading-snug">{MOTIVATION_TIER_RULE[tier]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TimelineRow({
  event,
  onDelete,
  deleting,
}: {
  event: PriceEvent;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/30 border border-border/50"
      data-testid={`row-price-event-${event.id}`}
    >
      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${KIND_DOT_CLASS[event.kind]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {PRICE_EVENT_KIND_LABEL[event.kind]}
          </p>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {formatDate(event.date)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {event.kind === "reduction" && event.oldPrice != null && (
            <>
              <span className="line-through">{formatMoney(event.oldPrice)}</span>
              <span>→</span>
            </>
          )}
          {event.newPrice != null && (
            <span className="font-medium text-foreground">{formatMoney(event.newPrice)}</span>
          )}
          {event.kind === "reduction" &&
            event.oldPrice != null &&
            event.newPrice != null &&
            event.oldPrice > 0 && (
              <span
                className="font-medium text-amber-700 dark:text-amber-300"
                data-testid={`text-event-drop-pct-${event.id}`}
              >
                ({formatDropPct(event.oldPrice, event.newPrice)})
              </span>
            )}
          {event.source && <span className="text-muted-foreground/70">· {event.source}</span>}
        </div>
        {event.note && (
          <p className="text-xs text-muted-foreground/80 italic mt-1">{event.note}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={deleting}
        title="Delete event"
        data-testid={`btn-delete-price-event-${event.id}`}
      >
        {deleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <IconTrash className="w-3.5 h-3.5 text-destructive/60 hover:text-destructive" />
        )}
      </Button>
    </div>
  );
}

interface AddEventFormProps {
  submitting: boolean;
  error?: string;
  onSubmit: (input: {
    kind: PriceEventKind;
    date: string;
    oldPrice: number | null;
    newPrice: number | null;
    source: string | null;
    note: string | null;
  }) => Promise<void>;
}

function AddEventForm({ submitting, error, onSubmit }: AddEventFormProps) {
  const [kind, setKind] = useState<PriceEventKind>("list");
  const [date, setDate] = useState<string>(todayIso());
  const [oldPrice, setOldPrice] = useState<string>("");
  const [newPrice, setNewPrice] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const showsOldPrice = kind === "reduction";
  const showsNewPrice = kind !== "delist";

  return (
    <form
      className="rounded-xl border border-border bg-muted/30 p-3 space-y-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({
          kind,
          date,
          oldPrice: oldPrice ? Number(oldPrice) : null,
          newPrice: newPrice ? Number(newPrice) : null,
          source: source.trim() || null,
          note: note.trim() || null,
        });
        setOldPrice("");
        setNewPrice("");
        setSource("");
        setNote("");
      }}
      data-testid="form-add-price-event"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Type</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PriceEventKind)}
            className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
            data-testid="select-price-event-kind"
          >
            {PRICE_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {PRICE_EVENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
            data-testid="input-price-event-date"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {showsOldPrice && (
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Prior price ($)
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={oldPrice}
              onChange={(e) => setOldPrice(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
              data-testid="input-price-event-old"
            />
          </div>
        )}
        {showsNewPrice && (
          <div className={showsOldPrice ? "" : "col-span-2"}>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {kind === "prior_sale" ? "Sale price ($)" : "New price ($)"}
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
              data-testid="input-price-event-new"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Source</label>
        <input
          type="text"
          maxLength={200}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. Zillow, broker email"
          className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
          data-testid="input-price-event-source"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Note</label>
        <input
          type="text"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional context"
          className="w-full px-2 py-1.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
          data-testid="input-price-event-note"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        type="submit"
        size="sm"
        disabled={submitting}
        className="w-full"
        data-testid="btn-submit-price-event"
      >
        {submitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Saving…
          </>
        ) : (
          "Save event"
        )}
      </Button>
    </form>
  );
}
