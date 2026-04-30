/**
 * SpecialistName.tsx — the single canonical way to display a Specialist's
 * name anywhere in the admin app. Persona-first / role-second, with a
 * monogram avatar tinted by the Specialist's subject group so a sidebar
 * of twelve-plus rows is still scannable at a glance.
 *
 * Doctrine (binding):
 *   `.agents/skills/specialist-persona-naming/SKILL.md` — persona-first
 *   naming rule, surfaces it applies to, voice rule, and resolution
 *   precedence. Read that skill before changing this file.
 *
 * Resolution precedence (high → low):
 *   1. liveHumanName  — admin override fetched from `/api/admin/specialists`
 *   2. catalog.humanName  — the persona name shipped in
 *      `engine/analyst/registry/specialist-catalog.ts`
 *   3. catalog.displayName  — the role label ("Funding Intelligence")
 *   4. catalog.realName  — the short technical name ("Funding")
 *   5. the raw id  — last-resort fallback so the UI never crashes
 *
 * Variants:
 *   • stacked — sidebar use. Persona name on the first line, role
 *     ("Funding Intelligence") quietly underneath.
 *   • inline  — page headers, toasts, status copy. Persona name with
 *     the role appended as " — Funding Intelligence" at a quieter tone.
 *   • chip    — mention chip for inline body copy ("Ana finished
 *     refreshing your funding ranges"). A small monogram circle in the
 *     subject's team color, then the persona name. Tooltip carries the
 *     role for context without crowding the line.
 *
 * Subject palette: each of the six subject groups (mgmt-co, property,
 * photos, portfolio-ops, constants, resources) gets a soft tinted
 * monogram so admins learn to scan by initial-color combination. The
 * palette is a fixed Tailwind hue per subject (amber / teal / fuchsia /
 * sky / violet / emerald) — chosen for memorability rather than for
 * mapping back to a theme token. The text colors carry an explicit
 * `dark:` variant so the chips read in light and dark mode alike;
 * Gaspar (the orchestrator) is the lone exception and uses the brand
 * `accent-pop` semantic token so a future palette refresh tracks him.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import {
  GASPAR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
} from "@engine/analyst/identity";
import type { Subject } from "@shared/schema/specialist";

export type SpecialistNameVariant = "stacked" | "inline" | "chip";
export type SpecialistNameSize = "sm" | "md" | "lg";

export interface SpecialistDisplay {
  /** The id passed in. Stable, slug-form. */
  id: string;
  /** Persona-first name to lead with ("Ana", "Fernanda", "Gaspar"). */
  humanName: string;
  /** Role/displayName for the secondary line ("Funding Intelligence"). */
  role: string;
  /** Subject group, drives the team color. `null` for non-catalog ids. */
  subject: Subject | "analyst" | null;
  /** First grapheme of `humanName`, uppercased, for the monogram avatar. */
  initial: string;
  /** Whether the name was resolved from a real catalog entry. */
  isCatalogEntry: boolean;
}

/**
 * Tailwind class fragments per subject. Each fragment paints the
 * monogram avatar (background tint + text color) and the chip ring.
 * Tints are soft so multiple chips on one line don't shout at each
 * other; the persona's *initial* carries the recognition load.
 */
const SUBJECT_PALETTE: Record<SpecialistDisplay["subject"] & string, string> = {
  "mgmt-co": "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  property: "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-500/20",
  photos: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/20",
  "portfolio-ops": "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/20",
  constants: "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/20",
  resources: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  // Gaspar (the orchestrator) lives outside the six subjects; he gets
  // the brand intelligence accent so he reads as the conductor, not
  // a peer of the twelve-plus catalog Specialists.
  analyst: "bg-accent-pop/15 text-accent-pop ring-accent-pop/20",
};

const FALLBACK_PALETTE = "bg-muted text-muted-foreground ring-border";

const SIZE_CONFIG: Record<
  SpecialistNameSize,
  { avatar: string; initial: string; primary: string; secondary: string }
> = {
  sm: { avatar: "w-5 h-5", initial: "text-[10px]", primary: "text-xs", secondary: "text-[10px]" },
  md: { avatar: "w-7 h-7", initial: "text-xs", primary: "text-sm", secondary: "text-xs" },
  lg: { avatar: "w-9 h-9", initial: "text-sm", primary: "text-base", secondary: "text-sm" },
};

interface AdminSpecialistRow {
  id: string;
  humanName?: string | null;
}

/**
 * Live override map — the same `/api/admin/specialists` query the
 * AI Intelligence sidebar uses. Memoized at the React-Query level so a
 * page with many `<SpecialistName />` instances does only one fetch.
 */
function useLiveHumanNames(): Map<string, string> {
  const { data } = useQuery<AdminSpecialistRow[]>({
    queryKey: ["/api/admin/specialists"],
    staleTime: 30_000,
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    if (!Array.isArray(data)) return map;
    for (const row of data) {
      if (!row?.id || typeof row.humanName !== "string") continue;
      // Trim before accepting so whitespace-only overrides (e.g. an
      // accidentally-saved " ") don't render as a blank persona name.
      const trimmed = row.humanName.trim();
      if (trimmed.length > 0) {
        map.set(row.id, trimmed);
      }
    }
    return map;
  }, [data]);
}

/**
 * Resolve a Specialist id to its display payload. Use this hook when
 * you need the parts (e.g. to compose your own layout) — otherwise
 * prefer the `<SpecialistName />` component which uses it internally.
 */
export function useSpecialistDisplay(id: string): SpecialistDisplay {
  const liveHumanNames = useLiveHumanNames();
  return useMemo(() => resolveSpecialistDisplay(id, liveHumanNames), [id, liveHumanNames]);
}

/**
 * Pure resolver — turn a Specialist id + override map into the full
 * display payload. Exported so legacy non-component callers (page
 * header builders, sidebar row builders, toast text generators) can
 * share one resolution chain instead of re-implementing the
 * humanName → displayName → realName → id fallback ladder.
 *
 * Most callers want `useSpecialistDisplay(id)` instead — this lower-
 * level form exists for code paths that already have the override map
 * in hand (built from the same `/api/admin/specialists` query) and
 * just need the resolved display data.
 */
export function resolveSpecialistDisplay(
  id: string,
  liveHumanNames: Map<string, string>,
): SpecialistDisplay {
  // The orchestrator is not in SPECIALIST_CATALOG — it has its own
  // identity record. Resolve it explicitly so callers can pass the
  // orchestrator id and still get a clean persona-first row.
  if (id === ORCHESTRATOR_SPECIALIST_ID) {
    const liveName = liveHumanNames.get(id);
    const humanName = liveName ?? GASPAR_IDENTITY.humanName;
    return {
      id,
      humanName,
      role: "The Analyst",
      subject: "analyst",
      initial: firstGrapheme(humanName).toUpperCase(),
      isCatalogEntry: true,
    };
  }

  const def = SPECIALIST_CATALOG.find((d) => d.id === id);
  if (!def) {
    // Unknown id — render the id itself as a last-resort fallback so
    // the UI never crashes on a stale or renamed Specialist.
    return {
      id,
      humanName: id,
      role: id,
      subject: null,
      initial: firstGrapheme(id).toUpperCase(),
      isCatalogEntry: false,
    };
  }
  const liveName = liveHumanNames.get(id);
  const humanName = liveName ?? def.humanName ?? def.displayName ?? def.realName;
  const role = def.displayName ?? def.realName;
  return {
    id,
    humanName,
    role,
    subject: def.subject,
    initial: firstGrapheme(humanName).toUpperCase(),
    isCatalogEntry: true,
  };
}

/**
 * Compose the canonical persona-first page-header *title* for a Specialist
 * id ("Ana · Funding Intelligence", "Daniela · Risk Intelligence",
 * "Gaspar · The Analyst"), reusing the shared resolution chain in
 * `resolveSpecialistDisplay`. Both `client/src/pages/AiIntelligence.tsx`
 * and `client/src/pages/Admin.tsx` call this so the AI Intelligence page,
 * the Admin shell, and the AI sidebar's `specialistRow` can never drift
 * on what name to lead with.
 *
 * `fallbackRole` is what to render when the catalog doesn't know the id
 * (and the resolver therefore returns a non-catalog placeholder). Each
 * page picks a different fallback that makes sense for its own chrome —
 * e.g. the section's marketing-copy title for AI Intelligence, or the
 * raw section slug for Admin — so the fallback stays a per-page concern
 * even though the persona-first assembly is shared.
 *
 * The "human name === role" guard keeps the title from rendering as
 * "Funding Intelligence · Funding Intelligence" if the catalog ever has
 * the same string in both slots; in that degenerate case the title
 * collapses to just the role label.
 *
 * See `.agents/skills/specialist-persona-naming/SKILL.md` for the rule.
 */
export function buildSpecialistTitle(
  id: string,
  liveHumanNames: Map<string, string>,
  fallbackRole: string,
): string {
  const display = resolveSpecialistDisplay(id, liveHumanNames);
  const role = display.isCatalogEntry ? display.role : fallbackRole;
  const human = display.isCatalogEntry && display.humanName !== display.role
    ? display.humanName
    : null;
  return human ? `${human} · ${role}` : role;
}

/**
 * Pull the first visible grapheme — handles accents and multi-byte
 * characters so "Eloá" → "E" cleanly, not the diacritic byte. Falls
 * back to "?" only if the name is empty.
 */
function firstGrapheme(name: string): string {
  if (!name) return "?";
  // Intl.Segmenter is the modern way; fall back to charAt for older
  // runtimes that don't support it (the avatar is decorative — the
  // tooltip carries the full name).
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const segmenter = new Seg(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(name)[Symbol.iterator]().next().value as
      | { segment: string }
      | undefined;
    return first?.segment ?? name.charAt(0);
  }
  return name.charAt(0);
}

export interface SpecialistNameProps {
  id: string;
  variant?: SpecialistNameVariant;
  size?: SpecialistNameSize;
  /**
   * When true, suppresses the role secondary line / suffix. Use for
   * dense lists where the persona name alone is enough context.
   */
  hideRole?: boolean;
  className?: string;
  dataTestId?: string;
}

export function SpecialistName({
  id,
  variant = "stacked",
  size = "md",
  hideRole = false,
  className,
  dataTestId = `specialist-name-${id}`,
}: SpecialistNameProps) {
  const display = useSpecialistDisplay(id);
  const cfg = SIZE_CONFIG[size];
  const palette = display.subject ? SUBJECT_PALETTE[display.subject] : FALLBACK_PALETTE;

  const monogram = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full ring-1 font-semibold leading-none shrink-0",
        cfg.avatar,
        cfg.initial,
        palette,
      )}
      aria-hidden
      data-testid={`${dataTestId}-monogram`}
    >
      {display.initial}
    </span>
  );

  if (variant === "stacked") {
    return (
      <span
        className={cn("inline-flex items-center gap-2 min-w-0", className)}
        data-testid={dataTestId}
      >
        {monogram}
        <span className="flex flex-col min-w-0 leading-tight">
          <span className={cn("font-medium truncate", cfg.primary)}>{display.humanName}</span>
          {!hideRole && display.humanName !== display.role && (
            <span className={cn("text-muted-foreground truncate", cfg.secondary)}>
              {display.role}
            </span>
          )}
        </span>
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={cn("inline-flex items-center gap-2 min-w-0", className)}
        data-testid={dataTestId}
      >
        {monogram}
        <span className={cn("font-medium truncate", cfg.primary)}>
          {display.humanName}
          {!hideRole && display.humanName !== display.role && (
            <span className={cn("text-muted-foreground font-normal", cfg.secondary)}>
              {" — "}
              {display.role}
            </span>
          )}
        </span>
      </span>
    );
  }

  // chip — for inline mention inside body copy. Tooltip carries the
  // full role so the chip can stay tight without losing context.
  const chipBody = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ring-1 align-middle",
        palette,
        cfg.primary,
        "font-medium",
        className,
      )}
      data-testid={dataTestId}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold leading-none shrink-0",
          // Chip monogram is one size smaller than the standalone avatar
          // so it sits visually inside the chip rather than dominating it.
          size === "lg" ? "w-5 h-5 text-xs" : size === "md" ? "w-4 h-4 text-[10px]" : "w-3.5 h-3.5 text-[9px]",
          "bg-background/40",
        )}
        aria-hidden
      >
        {display.initial}
      </span>
      <span className="truncate">{display.humanName}</span>
    </span>
  );

  if (hideRole || display.humanName === display.role) return chipBody;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{chipBody}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{display.role}</TooltipContent>
    </Tooltip>
  );
}
