# Analyst Team Vocabulary — Internal Naming vs User-Facing Voice

This rule reconciles two pressures:

1. The Analyst persona rule (`.claude/rules/the-analyst-persona.md`) requires **singular, capitalized "The Analyst"** in every user-facing string. Plurality is forbidden.
2. The actual system is a team — multiple Specialists, multiple Cognitive Panels, a Router, a Voice Renderer, a Scorer. Internal code needs team vocabulary or it cannot be discussed precisely.

This rule codifies where each vocabulary applies, and forbids crossing the line in either direction.

---

## User-facing vocabulary (unchanged)

**Canonical term:** `The Analyst` — always with capital `T`, capital `A`, and the definite article.

**Permitted user-facing variants:** none. No synonyms. No softening.

**Forbidden in user-facing code, copy, tooltips, emails, notifications:**
- `the analysts` (plural)
- `our analysts` / `your analysts` (possessive plural)
- `the analyst` (lowercase — always capitalize when referring to the agent)
- `the system` / `the system generated` / `the algorithm` / `AI-powered algorithm`
- `the chatbot` / `the assistant` / `AI helper` (reserved for Rebecca, who is a distinct agent)
- `Ask the Analyst` as a literal string in code (use `<AnalystButton />`; the button label stays short)
- `Regenerate Intelligence`, `No Intelligence` (legacy terms, replaced)

The authority on this list is `tests/audit/vocabulary-compliance.test.ts`. Any term that test forbids is forbidden here.

---

## Internal (code-facing) vocabulary

These names are used **only** in code identifiers, code comments, architecture docs, skills, rules, and commit messages. They must never appear in user-facing strings.

| Internal term | Definition | Canonical file reference |
|---|---|---|
| **Surface Specialist** | A small focused engine that owns one UI surface (a Mgmt-Co tab, a Property tab, Admin Defaults, ICP, Cross-Portfolio, Staleness). Evaluates inputs and returns an `AnalystVerdict`. | `docs/architecture/analyst/mgmt-co-specialists.md`, `property-specialists.md`, `admin-defaults-specialist.md`, `icp-specialist.md`, `cross-portfolio-specialist.md`, `staleness-specialist.md` |
| **Cognitive Engine** | The existing three-model parallel synthesis pipeline (`server/ai/research-orchestrator.ts` + ~25 supporting files). The brain Opus built. Treated as stable foundation. | `docs/architecture/analyst/cognitive-engine.md`, `.claude/notes/analyst-architecture.md` |
| **Cognitive Panel** (Quantitative / Market / Synthesis) | The three LLM roles inside the Cognitive Engine: Gemini 2.5 Flash (quantitative), Claude Sonnet 4.5 (market), Claude Opus 4.6 (synthesis). Plural here is fine — there ARE three panels. | `.claude/notes/analyst-architecture.md` |
| **Surface Router** | Pure-dispatch layer between HTTP routes/save events and Specialists. No LLM. Owns event-to-Specialist routing, multi-Specialist aggregation, conviction-floor decisions, Voice Renderer invocation. | `docs/architecture/analyst/surface-router.md`, `.claude/skills/analyst/orchestrator.md` |
| **Voice Renderer** | Single chokepoint between Specialist output and user-facing strings. Enforces persona rules at runtime. | `docs/architecture/analyst/voice-rendering.md`, `.claude/skills/analyst/voice.md` |
| **Quality Scorer** | Produces the 0-100 `qualityScore` every verdict carries. Folds source count, tier, age, spread, convergence, persona-fit. | `docs/architecture/analyst/quality-scoring.md`, `.claude/skills/analyst/quality-scoring.md` |
| **Cognitive Engine façade / client** | The typed wrapper at `engine/analyst/cognitive/engine-client.ts` (Phase 2 stub → Phase 3 implementation). Specialists import from it, never from `research-orchestrator.ts` directly. | `docs/architecture/analyst/cognitive-engine.md` |
| **`AnalystVerdict`** | The unified contract every Specialist returns (Phase 3+). TypeScript type at `engine/analyst/contracts/verdict.ts`. | `docs/architecture/analyst/verdict-contract.md`, `.claude/rules/analyst-verdict-contract.md` |

---

## Hard rules — directional enforcement

### Rule 1: Internal terms must NEVER appear in user-facing strings

Any of the terms in the table above that leaks into a tooltip, dialog, chat response, email, notification, chart caption, CTA label, or any other user-visible surface is a bug.

**How to check:** run `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` before every commit. Phase 3's Voice Renderer adds runtime enforcement that throws in dev and sanitizes in prod.

**Why:** users experience one trusted intelligence agent. Exposing the team contradicts the product stance.

### Rule 2: User-facing singular voice must NEVER appear in code identifiers

A function literally named `theAnalystValidates()` or a class `TheAnalyst` is a code smell. Code identifiers should use the internal team vocabulary:

| Bad (user-voice in code) | Good (team-vocabulary in code) |
|---|---|
| `theAnalystValidates()` | `analystVerdict.validate()` |
| `class TheAnalyst {}` | `class FundingSpecialist {}` or `class SurfaceRouter {}` |
| `askTheAnalyst()` | `surfaceRouter.dispatch()` or `cognitiveEngine.consult()` |
| `analystSaysSomething()` | `voiceRenderer.render(verdict)` |

**Why:** code reads well when identifiers name the actual structural role. "The Analyst" is marketing; the code has Specialists, a Router, an Engine, a Renderer. Mixing the two obscures both.

### Rule 3: Plural is OK in code when talking about actual plurals

- `specialists.map(s => s.evaluate(payload))` — correct; there are multiple Specialists.
- `cognitivePanels` — correct; there are three Panels.
- `surfaceRouter.dispatch(event)` — correct; one Router.

The singular-voice rule governs user-facing copy. It does not constrain legitimate plural code identifiers.

### Rule 4: Documentation uses internal vocabulary freely

Anywhere under `.claude/**`, `docs/architecture/**`, `docs/architecture/decisions/**`, inline `//` comments, JSDoc blocks, commit messages, PR descriptions — use the internal team vocabulary. Users never read these. The architecture spine would be unreadable if every mention of "Specialist" had to be paraphrased as "the bit of The Analyst that…".

---

## When in doubt

Ask: "Will a customer, LP, or founder see this string in the product?"

- **Yes** → singular "The Analyst" voice; no team terms.
- **No (code identifier, doc, comment, test name)** → team vocabulary is not only allowed but required for precision.

If the string starts as internal and later gets surfaced to the user, the Voice Renderer translates it. Specialists never render user-facing copy themselves.

---

## References

- `.claude/rules/the-analyst-persona.md` — the persona contract (user-facing authority)
- `.claude/skills/analyst/_index.md` — the skill entry point
- `tests/audit/vocabulary-compliance.test.ts` — the enforcement gate
- `docs/architecture/ANALYST.md` — the architecture spine
- `docs/architecture/decisions/ADR-001-analyst-two-tier.md` — why the split exists
