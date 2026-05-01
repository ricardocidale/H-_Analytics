# Analyst Sparkle Icon

**Audience:** all AI coders touching anything AI/Analyst-facing in the UI
**Priority:** high — brand consistency rule
**Trigger:** any time you render an "Analyst" CTA, an AI-feature button, an AI badge, or any visual that signals "powered by The Analyst" or "AI is at work here"

---

## The rule (one sentence)

**The Analyst's sparkle is the canonical 4-point twinkle (`IconSparkles` from `@/components/icons`) painted with `text-accent-pop` (the brand's amber/gold intelligence accent), paired everywhere with the label "Analyst".**

That combination — the twinkle shape + the gold color — is what reads as "The Analyst" across the entire app. Do not invent variants.

---

## Where it's defined

- **Icon shape:** `client/src/components/icons/media-icons.tsx` → `IconSparkles`
  A 4-pointed star with concave (pinched) sides — the classic "AI twinkle" — plus a smaller companion sparkle in the upper-right corner. SVG paths are bezier curves, not straight diagonals.
- **Color token:** `text-accent-pop` (CSS var `--accent-pop`, hsl(43 90% 55%) in the default light theme — amber/gold). This token is the brand's "intelligence" accent and is also used for the `stale` freshness dot, regulatory `GovernedFieldWrapper`, and Analyst badges.
- **Canonical CTA:** `client/src/components/intelligence/AnalystButton.tsx`. Every Analyst trigger in the app must go through this component.

---

## Forbidden anti-patterns

1. **Don't roll your own sparkle.** No `<svg>` ad-hoc, no `lucide-react` `Sparkles`, no Heroicons star, no emoji ✨. The shape and the color are a brand pair — using anything else breaks the recognition.
2. **Don't recolor the sparkle to `text-primary`, `text-foreground`, or `text-white`.** It must stay `text-accent-pop`. If the surrounding button is amber too (rare), use `text-accent-pop-foreground` for contrast — but this case is exotic.
3. **Don't pair the sparkle with a different label.** It's always "Analyst" (or "Analyst — {Tab}" for per-tab variants), never "AI", "Insights", "Magic", "Smart", or "Generate". See `.claude/skills/vocabulary/SKILL.md` §2.
4. **Don't add the sparkle to non-Analyst affordances** (Save, Add Property, Refresh, etc.). It is The Analyst's mark, not a generic "this button is fancy" decoration.
5. **Don't replace the sparkle when the button is loading.** Use `OrbitalDots` (already wired in `AnalystButton`) — never spin the sparkle, never swap to a different loader.

---

## Where the sparkle appears (correct usages)

- The Analyst CTA in every tab strip on Company Assumptions and Property Edit
- The Analyst CTA in research panels (`Consult` flows route through `AnalystButton`)
- Inline `AnalystButton size="sm"` in status bars and compact rows
- `AnalystValidationBanner` and any surface that says "The Analyst noted…"

If you find a sparkle anywhere else in the app, it's probably wrong — open an issue or fix it to use either `AnalystButton` or remove it.

---

## Why amber/gold (`accent-pop`)?

- High contrast on the dark default-variant button
- Already the app's "intelligence" accent (freshness dots, governed fields, research badges)
- Reads as "premium / valuable / worth paying attention to" without being alarming (which is reserved for `destructive` red)
- Distinguishes The Analyst from the green primary brand (Norfolk AI green) — the brand is the *company*, the sparkle is the *agent*

---

## When the theme switches

`--accent-pop` is theme-aware. Some themes redefine it (see `client/src/index.css`). The sparkle automatically follows the active theme's `accent-pop` value. Never hardcode an HSL or hex; always use the `text-accent-pop` utility.
