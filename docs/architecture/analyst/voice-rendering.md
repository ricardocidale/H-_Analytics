# Voice Renderer

**Status:** Spec — implementation lands in Phase 3.
**Future home:** `engine/analyst/voice/voice-renderer.ts`
**Parent:** `docs/architecture/ANALYST.md`
**Authority:** `.claude/rules/the-analyst-persona.md` is the persona contract; the Voice Renderer is its enforcement point.

---

## Purpose

The Voice Renderer is the single chokepoint between Specialist output and user-facing strings. It exists because:

1. Specialists are written in internal team vocabulary ("the Mgmt-Co Funding Specialist found …"). The user must never see that.
2. The persona rule has hard prohibitions (no plural, no "the system generated", no range without conviction). These need runtime enforcement, not just code review.
3. Tone consistency across ~12 Specialists is impossible without a single rendering layer.

---

## What it produces

Every `VerdictDimension.voice.headline` and `VerdictDimension.voice.detail` (and the surface-level `AnalystVerdict.voice.*`) is produced here, not in the Specialist. The Specialist supplies structured inputs:

```ts
specialist.emit({
  field: "marketing_cost_rate",
  severity: "advisory",
  range: { low: 0.03, mid: 0.04, high: 0.05, unit: "%" },
  qualityScore: 72,
  evidence: [...],
  intent: "above-range" | "below-range" | "within-range" | "missing-data",
  personaContext: { segment: "L+B", tier: "luxury" },
});
```

The Voice Renderer consumes this and produces:

```
headline: "Marketing at 4.0% — within The Analyst's L+B luxury range (3.0–5.0%, moderate conviction)."
detail:   "Five HVS and STR sources agree boutique-luxury operators run 3–5% of revenue on marketing. Expect LP questions if you go below 3%."
```

---

## Forbidden patterns (runtime-checked)

The Voice Renderer rejects (in dev: throws; in prod: logs + sanitizes) any output containing:

- `the analysts` (plural)
- `our analysts` / `your analysts` (plural)
- `the analyst` lowercase, when used as a noun referring to the agent (always capitalize "The Analyst")
- `the system generated` / `the system produced` / `the algorithm`
- `the chatbot` / `the assistant` / `AI helper` (these are reserved for Rebecca)
- `Save Changes` / `Save changes` (button label is just "Save")
- `Ask the Analyst` (use `<AnalystButton />` and drop the "Ask the")
- `Regenerate Intelligence`, `No Intelligence` (legacy terms)

A range without a conviction level is also forbidden. The renderer requires `qualityScore` to be present whenever `range` is present.

---

## Voice rules (positively stated)

- **Range-first.** Lead with the range, then the verdict, then the context.
- **Authoritative.** "states findings" not "we think maybe".
- **Concise.** One sentence per headline. Detail no longer than one paragraph.
- **Investor-aware.** When relevant, include "expect LP questions on this" or similar framing.
- **Singular voice.** "The Analyst reviewed", never "the system" or "we".

---

## Composition with the Severity → tone map

| Severity | Headline tone | Example opener |
|---|---|---|
| `ok` | Neutral confirmation | "Marketing at 4.0% — within The Analyst's L+B range." |
| `advisory` | Calibrated nudge | "F&B capture at 0.6 — at the low edge of The Analyst's range." |
| `warning` | Pointed but professional | "ADR projection 35% above L+B comps — The Analyst flags this for review." |
| `block` | Definitive | "Equity raise exceeds property basis — The Analyst will not endorse this configuration." |

---

## Composition with the Quality → conviction map

| Score | Conviction label in voice |
|---|---|
| 80-100 | "high conviction" |
| 60-79 | "moderate conviction" |
| 40-59 | "developing conviction" |
| < 40 | (verdict is downgraded; voice notes "developing data") |

These labels mirror what `confidence-scorer.ts` already emits inside the Cognitive Engine, so the migration is internal.

---

## Why this is a separate component (not a Specialist's job)

If each Specialist crafted its own user-facing strings, the persona would drift across surfaces and forbidden patterns would slip through. The Voice Renderer centralizes the rule enforcement and the tone calibration. It also makes it possible to A/B-test wording, regionalize voice, or adjust formality globally without touching Specialist code.

---

## Test coverage

`tests/analyst/voice/voice-renderer.test.ts` (Phase 3) asserts:

1. Every forbidden pattern from `tests/audit/vocabulary-compliance.test.ts` is rejected.
2. Every persona rule from `.claude/rules/the-analyst-persona.md` is enforced.
3. Severity-tone and quality-conviction mappings are stable.
4. The renderer is pure (same inputs → same output).

---

## Relationship to existing client-side text

Today, voice strings are scattered across `client/src/components/intelligence/*.tsx` and `client/src/components/analyst/*.tsx`. Phase 3 does not refactor those — they continue to render whatever the route returns. As route handlers move through the Surface Router and start returning `AnalystVerdict`, client components naturally consume the pre-rendered `voice.headline` / `voice.detail` instead of crafting strings locally.

The legacy paths can be cleaned up in Phase 4 or 5 once every route emits verdicts.
