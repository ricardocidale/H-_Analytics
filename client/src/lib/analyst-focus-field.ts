/**
 * Analyst field-focus URL bridge — companion to `analyst-mount-points.ts`.
 *
 * When the Analyst surfaces an "Adjust" CTA on a verdict dimension, the
 * mount-point resolver appends `?focus=<fieldId>` to the destination URL.
 * Pages that host Specialist-tracked form fields call
 * `useFocusFieldFromUrl()` once on mount; the hook reads the param, finds
 * the matching form-field DOM element, and scrolls + focuses it. This
 * closes the loop the field registry's `mountPoint` was designed to
 * enable: one click on an Analyst verdict carries the user to the exact
 * field that needs attention rather than only the section it lives in.
 *
 * Field-element discovery:
 *   The hook looks for the field via the two existing conventions in this
 *   codebase, in priority order:
 *     1. `[data-field="${fieldId}"]` — used by the Company Assumptions
 *        section components (see `RangePillsLayer.tsx` for the precedent).
 *     2. `[data-testid="field-${fieldId}"]` — used by the admin
 *        Model-Defaults `PctField`/`DollarField`/`NumberField` helpers.
 *   Neither side has to change to opt-in: as soon as a Specialist's field
 *   ids match an existing form's data-* attributes, the focus works.
 *
 * Retry policy:
 *   The destination page often renders the form lazily (Suspense boundary,
 *   tab switch, async data fetch). The hook retries discovery a few times
 *   with a short delay so a slow first render still gets focused. After
 *   focus succeeds OR the budget is exhausted, the `?focus` param is
 *   stripped from the URL via `history.replaceState` so a re-render or
 *   back-nav doesn't refire the focus side-effect.
 */
import { useEffect } from "react";
import { useSearch } from "wouter";
import { toast } from "@/hooks/use-toast";
import { describeMountPoint } from "@/lib/analyst-mount-points";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";

/** Query-string key used to ferry the field id through navigations. Kept
 *  as a single exported constant so `analyst-mount-points.ts` and any
 *  future producer of focus-deep-links use the same key. */
export const FOCUS_QUERY_PARAM = "focus";

/**
 * DOM contract a collapsible section uses to opt into auto-expansion when
 * the focus hook can't find one of its (currently hidden) field markers.
 *
 * Place the attribute on the visible toggle (button / Switch / disclosure
 * trigger) that, when clicked, would render the marker for the listed
 * field id(s). The value is a space-separated list of field ids the
 * trigger reveals — matched by CSS attribute selector `[~=…]`, the same
 * way `class` is matched, so multi-field triggers compose without quoting.
 *
 * Example:
 *   <Switch
 *     data-expand-trigger="capitalRaiseValuationCap"
 *     checked={showValuationCap}
 *     onCheckedChange={...}
 *   />
 *
 * Auto-expansion skips triggers that are already expanded
 * (`aria-expanded="true"`, `data-state="checked"`, or `data-state="open"`)
 * so the hook never *closes* a section the user already opened.
 */
export const EXPAND_TRIGGER_ATTR = "data-expand-trigger";

interface FocusFieldOptions {
  /** Maximum number of discovery attempts before giving up. */
  readonly maxAttempts?: number;
  /** Delay (ms) between retries while the field element isn't yet mounted. */
  readonly retryMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_RETRY_MS = 100;

function escapeForSelector(raw: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(raw);
  }
  // Minimal fallback for jsdom-style envs that lack CSS.escape: escape the
  // characters that matter inside a quoted attribute value selector.
  return raw.replace(/(["\\])/g, "\\$1");
}

/**
 * Find the form-field element associated with `fieldId`, prefering the
 * `data-field` convention used by Company Assumptions sections, then
 * falling back to the `data-testid="field-<id>"` convention used by the
 * admin Model-Defaults helpers.
 */
export function findFieldElement(fieldId: string): HTMLElement | null {
  if (!fieldId || typeof document === "undefined") return null;
  const escaped = escapeForSelector(fieldId);
  const dataFieldEl = document.querySelector<HTMLElement>(
    `[data-field="${escaped}"]`,
  );
  if (dataFieldEl) return dataFieldEl;
  return document.querySelector<HTMLElement>(
    `[data-testid="field-${escaped}"]`,
  );
}

/**
 * Scroll `el` into view and focus the most natural form control inside it
 * (or `el` itself if it is already a control). Used by `useFocusFieldFromUrl`
 * but exported for direct use by tests.
 */
export function focusFieldElement(el: HTMLElement): void {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const isControl = el.matches?.("input, textarea, select, button, [tabindex]");
  const focusTarget: HTMLElement | null = isControl
    ? el
    : (el.querySelector<HTMLElement>(
        "input, textarea, select, button, [tabindex]",
      ) ?? null);
  if (focusTarget && typeof focusTarget.focus === "function") {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch {
      // Older browsers that ignore the options bag — fall back to the
      // unconditional .focus() call.
      focusTarget.focus();
    }
  }
}

/**
 * One-shot lookup + focus. Returns `true` when the field was found and
 * focused, `false` otherwise. Exported for tests.
 */
export function focusFieldById(fieldId: string): boolean {
  const el = findFieldElement(fieldId);
  if (!el) return false;
  focusFieldElement(el);
  return true;
}

/**
 * Locate a section's "expand-on-demand" trigger for `fieldId`, if any.
 *
 * Looks for an element whose `data-expand-trigger` attribute lists the
 * field id as one of its space-separated tokens (`[~="<id>"]`). Sections
 * opt in by placing the attribute on the toggle that, when clicked,
 * would render the otherwise-hidden field marker — see the
 * `EXPAND_TRIGGER_ATTR` doc comment for the contract details.
 */
export function findExpandTriggerForField(
  fieldId: string,
): HTMLElement | null {
  if (!fieldId || typeof document === "undefined") return null;
  const escaped = escapeForSelector(fieldId);
  return document.querySelector<HTMLElement>(
    `[${EXPAND_TRIGGER_ATTR}~="${escaped}"]`,
  );
}

/**
 * Attempt to expand the collapsed parent of `fieldId` by clicking its
 * registered expand trigger. Returns `true` when a click was dispatched,
 * `false` otherwise (no trigger registered, or the trigger is already in
 * an expanded state).
 *
 * "Already expanded" detection uses three common flags so the hook works
 * with the disclosure idioms already in this codebase without forcing
 * sections to standardise on one:
 *   - `aria-expanded="true"` for ARIA disclosure buttons
 *   - `data-state="open"` for Radix collapsible / accordion roots
 *   - `data-state="checked"` for Radix Switch (used by ConvertibleTermsCard)
 *
 * Skipping expanded triggers is what makes the auto-expand safe to call
 * from a retry loop: clicking a Switch that's already on would *close*
 * the very section we're trying to reach.
 */
export function expandFieldContainer(fieldId: string): boolean {
  const trigger = findExpandTriggerForField(fieldId);
  if (!trigger) return false;
  const ariaExpanded = trigger.getAttribute("aria-expanded");
  if (ariaExpanded === "true") return false;
  const dataState = trigger.getAttribute("data-state");
  if (dataState === "checked" || dataState === "open") return false;
  if (typeof trigger.click !== "function") return false;
  try {
    trigger.click();
  } catch {
    return false;
  }
  return true;
}

/**
 * Dev-only warning surfaced when `useFocusFieldFromUrl()` exhausts its
 * retry budget without ever finding a marker for `fieldId` in the DOM.
 *
 * The build-time audit (task #771) catches static drift between the
 * field registry and the destination form's source, but a marker can
 * still be present in source yet hidden at runtime — e.g. inside a
 * collapsed/conditional section like the toggle-gated rows in
 * `ConvertibleTermsCard`. In those cases the user clicks Adjust, lands
 * on the right page, and the focus hook silently exhausts its budget.
 *
 * Logging here surfaces the failure during normal development without
 * polluting production logs (gated by `import.meta.env.DEV`). The
 * message names the missing fieldId and the URL that asked for it so
 * a developer can immediately see (a) which Specialist field id is
 * mis-aligned and (b) which destination page failed to expose it.
 */
function warnFocusFieldExhausted(fieldId: string): void {
  if (!import.meta.env.DEV) return;
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const url =
    typeof window !== "undefined" && window.location
      ? window.location.href
      : "(no window)";
  console.warn(
    `[analyst-focus-field] Could not focus field "${fieldId}" — ` +
      `no matching [data-field] or [data-testid="field-..."] marker ` +
      `appeared in the DOM after the retry budget was exhausted. ` +
      `URL: ${url}. The field may be inside a collapsed/conditional ` +
      `section, or the Specialist field id may not match any marker ` +
      `on this page.`,
  );
}

/**
 * User-facing toast surfaced when `useFocusFieldFromUrl()` exhausts its
 * retry budget without ever finding a marker for `fieldId` in the DOM.
 *
 * The dev-only `console.warn` above tells engineers what went wrong; this
 * toast tells the human admin who clicked Adjust that the click reached
 * the right page but the field is hidden — most often inside a collapsed
 * or conditionally-rendered section. Without it, an Adjust click that
 * lands on a hidden field looks like the page just sat there and did
 * nothing, which is the exact UX gap task #780 was opened to close.
 *
 * Section-aware copy (task #784): when the Specialist field registry
 * knows the field's owning section/tab via its `mountPoint`, the toast
 * names both the field and the section the admin needs to expand
 * (e.g. "Couldn't open Capital Raise 1 Amount — try expanding the
 * Funding tab on Company Assumptions."). Falls back to the generic
 * copy when the field isn't in the registry or the mount-point slug
 * doesn't resolve to a human surface, so an unregistered Specialist
 * field still gets a useful toast instead of nothing.
 *
 * Single-fire by construction: the caller strips the `?focus` param
 * immediately after exhaustion (see `stripFocusParam`), so a re-render
 * of the same page sees no param and the hook short-circuits before it
 * could re-fire this toast. One toast per Adjust navigation.
 */
function notifyFocusFieldExhausted(fieldId: string): void {
  if (typeof window === "undefined") return;
  const entry = getFieldRegistryEntry(fieldId);
  const description = entry
    ? describeMountPoint(entry.mountPoint, entry.subSection)
    : null;
  if (entry && description) {
    // Sub-section-aware copy (task #788): when the registry entry knows
    // the specific card inside the tab/section that hosts the field,
    // surface that card by name so admins land on the right one. Long
    // pages stack several cards under one tab and the previous
    // "expand the Funding tab" copy could not point at e.g. the
    // Convertible Terms card vs the Capital Raises card vs the
    // Capital Stack Discipline card. Falls back to the tab/section-
    // level copy from task #784 when `subSection` is absent, so
    // unannotated registry entries keep working.
    if (description.subSection) {
      toast({
        title: `Couldn't open ${entry.label}`,
        description:
          `It may be inside a collapsed card. ` +
          `Try expanding the ${description.subSection} card under the ` +
          `${description.section} ${description.kind} on ${description.surface}.`,
      });
      return;
    }
    toast({
      title: `Couldn't open ${entry.label}`,
      description:
        `It may be inside a collapsed ${description.kind}. ` +
        `Try expanding the ${description.section} ${description.kind} on ${description.surface}.`,
    });
    return;
  }
  toast({
    title: "Couldn't open this field",
    description:
      "It may be inside a collapsed section. Scroll to the section and expand it.",
  });
}

function stripFocusParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(FOCUS_QUERY_PARAM)) return;
  url.searchParams.delete(FOCUS_QUERY_PARAM);
  const search = url.searchParams.toString();
  const newUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", newUrl);
}

/**
 * React hook — pages that host Specialist-tracked form fields call this
 * once at mount. It reads `?focus=<fieldId>` from the URL, retries until
 * the form is mounted, scrolls + focuses the field, then strips the param
 * so the side-effect doesn't re-fire on re-renders or back-nav.
 *
 * Idempotent — if no `?focus` param is present, the hook is a no-op.
 *
 * URL-reactive (task #767): the hook subscribes to wouter's `useSearch()`
 * so it re-fires whenever the URL search string changes, not only on the
 * initial mount. This matters when the user is already on the destination
 * page (e.g. clicking "Open this field" on the Funding tab while sitting
 * on the Funding tab) — wouter's `navigate()` only changes the URL via
 * `history.pushState` and the page does not re-mount, so a mount-only
 * effect would silently no-op. Wouter monkey-patches `pushState` /
 * `replaceState` to dispatch synthetic events, which `useSearch()` reads
 * via `useSyncExternalStore`, so both the producer's `navigate()` AND the
 * cleanup's `stripFocusParam()` round-trip cleanly.
 */
export function useFocusFieldFromUrl(opts: FocusFieldOptions = {}): void {
  // Subscribe to URL search-string changes so same-page deep links (e.g.
  // clicking "Open this field" while already on the destination surface)
  // still trigger the focus side-effect. The value itself is not used —
  // it only exists to schedule a re-run of the effect below.
  const search = useSearch();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // Read directly from `window.location.search` rather than the `search`
    // value in scope: the two are equivalent in the browser, and using
    // `window.location` keeps the hook robust if a downstream test stub
    // returns a stale snapshot from `useSearch()`.
    const url = new URL(window.location.href);
    const fieldId = url.searchParams.get(FOCUS_QUERY_PARAM);
    if (!fieldId) return;

    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const retryMs = opts.retryMs ?? DEFAULT_RETRY_MS;
    let attempts = 0;
    let timer: number | null = null;
    // Auto-expand discovery is a single one-shot per Adjust navigation: if
    // the marker can't be found, we look up the field's registered
    // `data-expand-trigger`, click it once, and let subsequent retries pick
    // up the now-rendered marker. We do not loop on expansion — clicking
    // the same toggle twice is a *close*, not a deeper open, so trying
    // again would silently undo the first click.
    let didTryExpansion = false;

    const tryFocus = (): void => {
      attempts += 1;
      const ok = focusFieldById(fieldId);
      if (ok) {
        stripFocusParam();
        timer = null;
        return;
      }
      // Field marker isn't in the DOM. If we haven't yet tried to expand
      // its owning section, do so now (before deciding whether the budget
      // is exhausted) so the next retry tick can find the freshly-rendered
      // marker. Auto-expansion does NOT consume the attempt budget on its
      // own — the budget governs how many *lookups* we make, not how many
      // expand-then-lookup cycles we run.
      if (!didTryExpansion) {
        didTryExpansion = true;
        if (expandFieldContainer(fieldId)) {
          // Schedule the next retry without consuming budget for the
          // expand itself. We've already incremented `attempts`, but the
          // bump is fine; what matters is we don't fall into the
          // "exhausted" branch on the same tick that just dispatched the
          // click — the React setState triggered by the click hasn't had
          // a chance to render the marker yet.
          timer = window.setTimeout(tryFocus, retryMs);
          return;
        }
        // No trigger registered for this field — fall through to the
        // normal exhaust-or-retry path; the toast will fire on
        // exhaustion exactly as it did before this contract existed.
      }
      if (attempts >= maxAttempts) {
        warnFocusFieldExhausted(fieldId);
        notifyFocusFieldExhausted(fieldId);
        stripFocusParam();
        timer = null;
        return;
      }
      timer = window.setTimeout(tryFocus, retryMs);
    };

    // Defer one tick so Suspense fallbacks / lazy boundaries have a chance
    // to swap in the real form before the first lookup attempt.
    timer = window.setTimeout(tryFocus, 0);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
    // Re-run when the URL search string changes (a new `?focus=` lands or
    // the previous one is stripped). `opts.maxAttempts` / `opts.retryMs`
    // are read off the live `opts` object inside the effect — callers pass
    // a stable literal, so the hook would re-fire spuriously if we listed
    // them in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
}
