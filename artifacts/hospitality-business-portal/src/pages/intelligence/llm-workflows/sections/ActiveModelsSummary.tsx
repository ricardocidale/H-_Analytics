/**
 * ActiveModelsSummary — read-only "Active Models" strip rendered above the
 * HeaderBar on each LLMs sub-page (Agents, Research, Graphics, Other).
 *
 * Lets admins see at a glance which model is currently assigned to each slot
 * in the active category, without expanding each accordion group. Slots with
 * no assignment (i.e. using the system fallback) get a muted badge so they're
 * easy to spot.
 *
 * Each row also shows a small vendor health dot (green = available,
 * red = probed but down, grey = not probed) using the same convention as the
 * HeaderBar vendor-health panel and SlotCard, so admins can spot a slot
 * pointing at a down vendor without scrolling.
 *
 * Information only — no interactive controls. The category prop scopes the
 * shown slots to the active sub-page; when undefined, all slots are shown.
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { ResourcePublicView } from "@shared/schema";
import { LLM_VENDORS } from "@/components/admin/research-center/research-shared";
import type { LlmRegistryState } from "@/lib/api/admin";
import {
  SLOT_GROUPS,
  SLOT_GROUP_CATEGORY_MAP,
  type LlmCategory,
} from "../constants";
import type { ModelConfig, SlotConfig } from "../types";

type VendorStatus = LlmRegistryState["vendorStatuses"][number];

export interface ActiveModelsSummaryProps {
  slotResources: ResourcePublicView[];
  modelResources: ResourcePublicView[];
  category?: LlmCategory;
  vendorStatuses?: VendorStatus[];
}

export function ActiveModelsSummary({
  slotResources,
  modelResources,
  category,
  vendorStatuses,
}: ActiveModelsSummaryProps) {
  const visibleGroups = useMemo(
    () =>
      category
        ? SLOT_GROUPS.filter((g) => SLOT_GROUP_CATEGORY_MAP[g.id] === category)
        : SLOT_GROUPS,
    [category],
  );

  const visibleSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const g of visibleGroups) for (const s of g.slots) set.add(s);
    return set;
  }, [visibleGroups]);

  const modelBySlug = useMemo(() => {
    const map: Record<string, ResourcePublicView> = {};
    for (const m of modelResources) map[m.slug] = m;
    return map;
  }, [modelResources]);

  const vendorStatusByVendor = useMemo(() => {
    const map: Record<string, VendorStatus> = {};
    for (const vs of vendorStatuses ?? []) map[vs.vendor] = vs;
    return map;
  }, [vendorStatuses]);

  // Preserve the canonical slot order defined in SLOT_GROUPS.
  const orderedSlots = useMemo(() => {
    const bySlug: Record<string, ResourcePublicView> = {};
    for (const s of slotResources) bySlug[s.slug] = s;
    const out: ResourcePublicView[] = [];
    for (const g of visibleGroups) {
      for (const slug of g.slots) {
        if (bySlug[slug]) out.push(bySlug[slug]);
      }
    }
    // Include any visible-category slots that aren't listed in groups
    // (defensive; should be rare).
    for (const s of slotResources) {
      if (visibleSlugs.has(s.slug) && !out.includes(s)) out.push(s);
    }
    return out;
  }, [slotResources, visibleGroups, visibleSlugs]);

  // A slot is on the system fallback whenever we cannot resolve a concrete
  // model resource — either no modelSlug set, or the slug points at a model
  // that no longer exists in the registry. Counted the same way it is
  // rendered below so the header count never disagrees with visible badges.
  const fallbackCount = orderedSlots.filter((s) => {
    const slug = (s.config as SlotConfig | null)?.modelSlug ?? null;
    return !slug || !modelBySlug[slug];
  }).length;

  if (orderedSlots.length === 0) {
    return (
      <div
        className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3"
        data-testid="active-models-summary"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Active Models
        </h3>
        <p className="text-[11px] text-muted-foreground">
          No slot-level model assignments in this category. Defaults are
          inherited from the function-area selection below.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3"
      data-testid="active-models-summary"
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Active Models
        </h3>
        <p className="text-[10px] text-muted-foreground/70">
          {orderedSlots.length} slot{orderedSlots.length !== 1 ? "s" : ""}
          {fallbackCount > 0
            ? ` · ${fallbackCount} on system fallback`
            : ""}
        </p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1.5">
        {orderedSlots.map((slot) => {
          const slug = (slot.config as SlotConfig | null)?.modelSlug ?? null;
          const model = slug ? modelBySlug[slug] : null;
          const vendor = (model?.config as ModelConfig | null)?.vendor;
          const vendorLabel =
            LLM_VENDORS.find((v) => v.value === vendor)?.label ?? vendor;
          const vendorStatus = vendor ? vendorStatusByVendor[vendor] : undefined;

          // Only render a dot when there's an assigned model — fallback rows
          // have no vendor to probe.
          let dotClass: string | null = null;
          let dotTitle = "";
          if (model && vendor) {
            if (vendorStatus?.available) {
              dotClass = "bg-green-500";
              dotTitle = `${vendorLabel ?? vendor} reachable${
                vendorStatus.avgLatencyMs
                  ? ` · ${vendorStatus.avgLatencyMs}ms`
                  : ""
              }`;
            } else if (vendorStatus) {
              dotClass = "bg-red-500";
              dotTitle = `${vendorLabel ?? vendor} unavailable${
                vendorStatus.error ? ` · ${vendorStatus.error}` : ""
              }`;
            } else {
              dotClass = "bg-gray-400";
              dotTitle = `${vendorLabel ?? vendor} not probed yet — run Analyst to refresh`;
            }
          }

          return (
            <li
              key={slot.id}
              className="flex items-center gap-2 min-w-0 text-[11px]"
              data-testid={`active-model-row-${slot.slug}`}
            >
              <span
                className="font-medium text-foreground/90 truncate shrink min-w-0"
                title={slot.displayName}
              >
                {slot.displayName}
              </span>
              <span className="text-muted-foreground/50 shrink-0">→</span>
              {model ? (
                <>
                  {dotClass && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotClass}`}
                      title={dotTitle}
                      aria-label={dotTitle}
                      data-testid={`active-model-vendor-dot-${slot.slug}`}
                    />
                  )}
                  <span
                    className="text-muted-foreground truncate shrink min-w-0"
                    title={`${vendorLabel ?? ""}${vendorLabel ? " · " : ""}${model.displayName}`}
                  >
                    {vendorLabel ? (
                      <span className="text-foreground/70">{vendorLabel}</span>
                    ) : null}
                    {vendorLabel ? " · " : ""}
                    {model.displayName}
                  </span>
                </>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 bg-muted/40 text-muted-foreground border-border/60 shrink-0"
                  data-testid={`active-model-fallback-${slot.slug}`}
                >
                  system fallback
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
