# Skill: Voice Renderer

**Status:** Spec — implementation lands in Phase 3 at `engine/analyst/voice/voice-renderer.ts`.
**Descriptive companion:** `docs/architecture/analyst/voice-rendering.md`.
**Persona authority:** `.claude/rules/the-analyst-persona.md` is non-negotiable. This skill enforces it.
**Parent skill:** `_index.md`.

---

## What this skill covers

Directive guidance for the Voice Renderer — the single chokepoint between Specialist output and user-facing strings. Every `VerdictDimension.voice.headline`, `VerdictDimension.voice.detail`, and surface-level `AnalystVerdict.voice.*` is produced here.

---

## Hard rules

### 1. Specialists NEVER craft user-facing strings

Specialists supply structured inputs (field, severity, range, qualityScore, evidence, intent, personaContext). The Voice Renderer composes the string. A Specialist that emits a raw string field in its verdict — and expects that string to reach the user — is a bug.

Before Phase 3 lands, the existing evaluators return plain `Alert.message` strings directly. These are tolerated only until Phase 3 migrates them. New Specialists MUST follow the structured-input pattern from day one even if the Renderer isn't yet operational (`voice: { headline: "", detail: "" }` stubs until Phase 3 fills them in).

### 2. Forbidden patterns are runtime-checked

The Voice Renderer rejects (dev: throws; prod: logs + sanitizes + emits `voice-violation` metric) any output containing:

- `the analysts` (plural)
- `our analysts` / `your analysts` (possessive plural)
- `the analyst` lowercase (always capitalize when referring to the agent)
- `the system generated` / `the system produced` / `the algorithm`
- `the chatbot` / `the assistant` / `AI helper` (reserved for Rebecca)
- `Save Changes` / `Save changes` (button label is just "Save")
- `Ask the Analyst` as a literal (use `<AnalystButton />`; drop "Ask the")
- `Regenerate Intelligence`, `No Intelligence` (legacy terms)

The canonical list lives in `tests/audit/vocabulary-compliance.test.ts`. The Voice Renderer mirrors it. When the test list changes, the Renderer's list changes.

### 3. Range without a conviction level is forbidden

If `range` is present on a dimension, `qualityScore` MUST be present. The Renderer refuses to emit a headline that mentions a range without a conviction tier. This is the persona rule: "NEVER show a range without a conviction level."

### 4. Severity → tone mapping is stable

| Severity | Headline tone | Example opener |
|---|---|---|
| `ok` | Neutral confirmation | "Marketing at 4.0% — within The Analyst's L+B range." |
| `advisory` | Calibrated nudge | "F&B capture at 0.6 — at the low edge of The Analyst's range." |
| `warning` | Pointed but professional | "ADR projection 35% above L+B comps — The Analyst flags this for review." |
| `block` | Definitive | "Equity raise exceeds property basis — The Analyst will not endorse this configuration." |

Tone changes across this table require an ADR. Individual strings are free to vary within the tone.

### 5. Quality → conviction mapping is stable

| `qualityScore` | Conviction label |
|---|---|
| 80-100 | "high conviction" |
| 60-79 | "moderate conviction" |
| 40-59 | "developing conviction" |
| < 40 | (verdict downgraded to `severity: "ok"`; voice notes "developing data") |

These labels mirror what `server/ai/confidence-scorer.ts` already emits inside the Cognitive Engine, so the migration is internal. Do NOT invent new labels.

---

## Voice rules (positively stated)

- **Range-first.** Lead with the range, then the verdict, then the context.
- **Authoritative.** "states findings" — not "we think maybe perhaps".
- **Concise.** One sentence per headline. Detail no longer than one paragraph.
- **Investor-aware.** Where relevant, include "expect LP questions on this" framing.
- **Singular voice.** "The Analyst reviewed", never "we" or "the system".
- **Persona-aware.** If `personaContext` is provided, the headline reflects it ("within The Analyst's L+B luxury range" rather than just "within range").

---

## Structured inputs the Specialist provides

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

The Renderer uses `field` to look up human-readable field names, `severity` to pick the tone, `range` + `qualityScore` to craft the range phrasing, `intent` to shape the verb, `personaContext` to anchor the range, and `evidence` to compose the `detail` paragraph.

---

## Example output

For the inputs above, the Renderer produces:

```
headline: "Marketing at 4.0% — within The Analyst's L+B luxury range (3.0–5.0%, moderate conviction)."
detail:   "Five HVS and STR sources agree boutique-luxury operators run 3–5% of revenue on marketing. Expect LP questions if you go below 3%."
```

---

## What lives in the Voice Renderer

| Lives here | Does not live here |
|---|---|
| Field-key → human-readable name map | Field value itself (that's in the verdict) |
| Severity → tone templates | Severity classification (that's the Specialist's job) |
| Quality → conviction label map | Quality Scoring formula (that's the Quality Scorer's job) |
| Forbidden-pattern runtime check | Vocabulary test definitions (they live in `tests/audit/`) |
| Persona-aware phrasing ("L+B luxury", "select-service", etc.) | Persona definitions (they live in `.claude/brand-voice-guidelines.md`) |
| Sentence composition and punctuation discipline | Evidence list computation |

---

## Testing (Phase 3)

`tests/analyst/voice/voice-renderer.test.ts` asserts:

1. Every forbidden pattern from `tests/audit/vocabulary-compliance.test.ts` is rejected.
2. Every persona rule from `.claude/rules/the-analyst-persona.md` is enforced.
3. Severity-tone and quality-conviction mappings are stable.
4. The renderer is pure — same inputs produce same output.

A PR that changes the Renderer without updating these tests is incomplete.

---

## Relationship to the client

Today, voice strings are scattered across `client/src/components/intelligence/*.tsx` and `client/src/components/analyst/*.tsx`. Phase 3 does not refactor those — they continue to render whatever the route returns. As route handlers move through the Surface Router and start returning `AnalystVerdict`, client components naturally consume `voice.headline` / `voice.detail` instead of crafting strings.

The legacy client paths can be cleaned up in Phase 4 or 5 once every route emits verdicts.

---

## What NOT to do

- Do not let a Specialist emit a raw user-facing string.
- Do not bypass the Renderer and write to `voice.headline` directly from the Router.
- Do not add a new forbidden pattern without also adding it to `tests/audit/vocabulary-compliance.test.ts`.
- Do not add a new severity tier or quality tier without an ADR.
- Do not change tone templates to sound more "friendly" or "helpful" — the tone is investor-report discipline. Warmth belongs to Rebecca, not The Analyst.

---

## References

- `.claude/rules/the-analyst-persona.md` — the non-negotiable persona authority
- `.claude/rules/analyst-team.md` — internal vocabulary rule
- `.claude/rules/branding-vocabulary-enforcement.md` — forbidden phrases list
- `.claude/brand-voice-guidelines.md` — the tone bible
- `docs/architecture/analyst/voice-rendering.md` — descriptive spec
- `tests/audit/vocabulary-compliance.test.ts` — current enforcement gate
- `server/ai/confidence-scorer.ts` — existing conviction tier producer
- `.claude/skills/analyst/steward.md` — change-control gate for Voice changes
