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

## Wait copy — what the user sees while The Analyst studies

The button label stays terse (`Analyst` → `Studying…`). The **descriptive sub-line** that appears next to the spinner — the message the user actually reads while waiting — is governed by `.claude/brand-voice-guidelines.md` (the canonical source) and reinforced in `.claude/skills/analyst/voice.md`.

### The verb list (non-negotiable)

The brand voice canon (§6 *Loading State Verbs*) prescribes the present-participle verbs The Analyst uses while at work. **Use exactly one of these** as the lead verb:

> **USE:** studying · reviewing · cross-referencing · checking · weighing · forming a view
>
> **NEVER:** processing · generating · computing · loading · running · executing · consulting · thinking · analyzing · working

`consulting` and `thinking` are common slips that read as software, not as a colleague — they are out. (`AnalystButton.tsx`'s current "Consulting..." string is a known drift from this canon and should be migrated to "Studying…" the next time it is touched.)

### The shape of the message

From the Tone-by-Context Matrix (§4): loading copy is **low-formality, medium-warmth, no wit, and specific to the work**. The sub-line names the *thing being studied* in plain language — never the machinery.

| | ❌ Wrong | ✅ Right |
|---|---|---|
| Generic | "Loading…" / "Please wait…" | "Studying current market data…" |
| Implementation-leaking | "Generating AI analysis…" / "Calling LLM…" | "Cross-referencing STR and CBRE reports…" |
| Fake activity | "Thinking really hard…" | "Reviewing the last quarter of ADR observations…" |
| Vague | "Working on it…" | "Checking the latest labor-rate surveys for this market…" |

### The pattern — use the canonical component

`<AnalystStudyingIndicator />` (`client/src/components/analyst/AnalystStudyingIndicator.tsx`) is the **single visual + voice contract** for every research wait state. It pairs the gold sparkle with a topic-keyed rotating sub-line drawn from the curated lexicon at `client/src/components/analyst/studying-lines.ts`. Do not roll your own — extend the lexicon if your topic isn't covered.

```tsx
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { AnalystStudyingIndicator } from "@/components/analyst";

<div className="flex flex-col gap-2">
  <AnalystButton onClick={refresh} isRunning={isRunning} suffix="Benchmarks" />
  {isRunning && (
    <AnalystStudyingIndicator topic="hospitality-benchmarks" variant="block" />
  )}
</div>
```

The indicator already handles:

- The gold sparkle with a slow breathing pulse (the brand mark for "AI is at work")
- A 3.5s rotation through the topic's bank with a fade/blur transition
- The animated three-dot ellipsis after the sub-line (the Claude-Code "still working" feel)
- An accessible `role="status"` + `aria-live="polite"` so screen readers announce changes
- A stable `data-testid="indicator-analyst-studying"` for guards and integration tests

### When to add a new topic

If your surface needs a topic that isn't in `STUDYING_LINES`, add a new key (kebab-case) and 5–7 lines following the editing rules at the top of `studying-lines.ts`:

- Lead with one of the six approved gerunds
- Name a concrete artifact (a report, a market, a metric, a comp set)
- End with `…` (U+2026), not `...`
- Under 60 characters, no exclamation, no emoji, no first-person warmth

If the surface is one-off and unlikely to be reused, pass a bespoke `lines={[…]}` array — but the same voice rules still apply, and code review will hold the line.

### Forbidden patterns (caught by guards or review)

- Buttons that show `Consulting…`, `Thinking…`, `Processing…`, `Loading…`, `Generating…`, `Working on it…`, or any progressive-form verb outside the approved list
- Sub-lines that name the implementation (`Calling Claude…`, `Querying database…`, `Fetching from API…`)
- Sub-lines without a specific noun phrase (`Studying…` alone is too vague — append what is being studied)
- Exclamation marks, emojis, or "Great question!"-style warmth (that voice belongs to Rebecca, not The Analyst)

## Quick checklist before committing a research-trigger button

1. Label is `Analyst` (or `Studying…` while in-flight). ✅
2. Icon is `Sparkles` / `IconSparkles`. ✅
3. Tooltip / `title` carries the verb. ✅
4. `data-testid` starts with `button-analyst-`. ✅
5. Header text on the surface reads `Analyst — …`, not `Refresh research — …`. ✅
6. **Wait sub-line uses an approved verb (`studying`, `reviewing`, `cross-referencing`, `checking`, `weighing`, `forming a view`) and names a specific artifact.** ✅
7. The guard test passes (`npx vitest run tests/audit/analyst-button-convention.test.ts`). ✅
