---
name: analyst-research-buttons
description: Use whenever you create, modify, or review a UI control that triggers a research job — Refresh research, Refresh rate, Re-fetch from authority, Run specialist, Run analysis, "ask the model" / "have the AI study this" buttons. Applies to every surface that kicks off The Analyst or an AI Intelligence specialist research job (Constants tabs, Specialist pages, Market Rates, Property Edit, Company Assumptions, Industry Research, etc.). Replaces ad-hoc labels like "Refresh research", "Refresh", "Run", "Update", or bare refresh-icon buttons with the canonical Analyst affordance.
---

# Analyst Research Button — Canonical Affordance

## The rule (non-negotiable)

Every UI control that triggers a research job (a call into The Analyst or one of the AI Intelligence specialists) MUST present as:

- **Label:** `Analyst` (idle) / `Studying…` (in-flight). Nothing else. Not "Refresh research", not "Refresh", not "Run", not "Re-fetch", not "Update from source".
- **Icon:** the sparkle icon — `Sparkles` from `lucide-react` (or the project alias `IconSparkles` from `@/components/icons`). Nothing else. Not `RefreshCw`, not `Play`, not `Zap`.
- **Tooltip / `title`:** explains what The Analyst will do in this context (e.g. "Have the Analyst re-fetch this constant from the cited authority. Preview before applying."). The tooltip is where the verb lives — the button label stays "Analyst".
- **`data-testid`:** `button-analyst-{suffix}` (e.g. `button-analyst-${row.key}`). Never `button-refresh-…`.

Header / popover titles for the same surface should read `Analyst — {what it acts on}` (e.g. `Analyst — Property tax rate`), not "Refresh research — …".

## Why

This is the project's most-violated UI convention. The user has corrected it more than once. The rule exists because:

1. The Analyst is the singular user-facing voice (`replit.md` voice rule). All research surfaces must reinforce that voice.
2. The sparkle icon is the project's signature for "AI is doing work here" — users learn to trust it as the entry point to specialist research.
3. Inconsistent labels ("Refresh", "Run", "Re-fetch") leak the internal vocabulary (Specialist, Surface, Cognitive Engine) into the user-facing surface, breaking the singular-voice rule.

## How to comply

### Preferred: use the canonical component

`client/src/components/analyst/AnalystActionButton.tsx` already implements the rule end-to-end — Sparkles icon, "Analyst"/"Studying…" label, amber accent styling, tooltip wrapper, cooldown handling, `data-testid` shape. **Use it.**

```tsx
import { AnalystActionButton } from "@/components/analyst";

<AnalystActionButton
  onClick={runResearch}
  running={mutation.isPending}
  testIdSuffix={row.key}
  variant="header"
/>;
```

### When you cannot use the component

Some surfaces wrap the trigger in a `Popover` / `Dialog` / custom layout that conflicts with `AnalystActionButton`'s built-in `Tooltip`. In that case, hand-roll the affordance but hold the contract:

```tsx
import { Sparkles } from "lucide-react"; // or IconSparkles from "@/components/icons"

<Button
  variant="ghost"
  size="sm"
  onClick={handleClick}
  title="Have the Analyst re-fetch this rate from the cited authority."
  data-testid={`button-analyst-${row.key}`}
>
  {pending
    ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
    : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
  {pending ? "Studying…" : "Analyst"}
</Button>;
```

## Forbidden patterns (the guard catches these)

A guard test — `tests/audit/analyst-button-convention.test.ts` — fails the build if any of these appear in `client/src/`:

- A button containing `>Refresh research<` / `>Refresh Research<`
- A button labeled `>Refresh<` / `>Run<` / `>Run now<` / `>Re-fetch<` paired with a `RefreshCw` / `Play` icon next to a research mutation hook
- A `data-testid="button-refresh-research-…"` on a research-trigger button (use `button-analyst-…`)
- A research-trigger button using `RefreshCw` instead of `Sparkles` as the lead icon

If your surface legitimately needs a non-Analyst refresh (e.g. a pure cache-bust that does NOT call into The Analyst or a specialist), add the file to the allowlist at the top of the guard test with a one-line justification.

## Quick checklist before committing a research-trigger button

1. Label is `Analyst` (or `Studying…` while in-flight). ✅
2. Icon is `Sparkles` / `IconSparkles`. ✅
3. Tooltip / `title` carries the verb. ✅
4. `data-testid` starts with `button-analyst-`. ✅
5. Header text on the surface reads `Analyst — …`, not `Refresh research — …`. ✅
6. The guard test passes (`npx vitest run tests/audit/analyst-button-convention.test.ts`). ✅
