# The Analyst — Architectural Mental Model (Claude Code's notes)

**Audience:** Replit Agent + future Claude Code sessions.
**Purpose:** Share the mental model I've built of how The Analyst is constructed, so we're both reasoning about the same picture when we touch this code. **Not instructional** — no "you should do X" anywhere. Just what I see, including the parts that impressed me and the parts where I still have questions.

**Date written:** April 2026, after the Phase 5B KB cleanup work.

---

## TL;DR — One-paragraph picture

The Analyst is **not one file**. It's a three-model parallel synthesis pipeline with a classical "orchestrator + workers + memory + validators" shape, wrapped by thin client UI and a RESTful streaming API. The "mega-powerful" feeling the user is pointing at comes from the fact that every research call fans out across **Gemini 2.5 Flash + Claude Sonnet 4.5 in parallel**, cross-validates the outputs against **live market data**, reads **similar past research from Pinecone**, and then **Claude Opus 4.6** synthesizes all of that into a single reconciled answer streamed to the client. Model disagreement becomes the confidence band — which is a genuinely clever design choice. The rest of the ~40 files in `server/ai/` are the supporting cast that feeds context in, extracts guidance out, monitors staleness, governs behavior, and renders results.

---

## The brain — `server/ai/research-orchestrator.ts:272` (`orchestrateResearch`)

This is the one file to read if you want to understand The Analyst. 455 lines. AsyncGenerator that yields SSE-compatible events to the client as it runs. I'll walk through what it actually does, phase by phase, with file references.

### Phase 0 — Progressive relaxation (comparable set)

Before either analyst panel speaks, the orchestrator asks the **comparables engine** at `server/ai/comparables/relaxation-engine.ts` to assemble a set of peer properties. "Progressive relaxation" means: start with strict matching (same country, same tier, same size range), and if not enough comps match, loosen constraints level-by-level until `evidenceScore` is acceptable. The resulting `compsBlock` gets injected into `v2Prompt` right above `## RESEARCH INSTRUCTIONS` so both analyst panels see the same peer set.

This matters because it turns "what ADR range is reasonable in Medellín?" into "what ADR range is reasonable given these 5 specifically-chosen peer properties?" The prompt stops being a generic market question and becomes a constrained reasoning task. That's how the range pills get their precision.

### Phase 1 — Parallel dual panel

Both models run simultaneously via `Promise.all`:

- **Analyst A = Gemini 2.5 Flash** (role: `"quantitative"`) — numbers, ranges, benchmarks
- **Analyst B = Claude Sonnet 4.5** (role: `"market-strategy"`) — narrative, risk, positioning

Each panel is produced by `runAnalystPanel()` (same file), which dispatches to the correct SDK via `server/ai/clients.ts`. The panels return typed `AnalystPanel` objects with `{ model, role, output, durationMs, error? }`.

In parallel with the panels, the orchestrator also queries **Pinecone**'s `research-history` namespace via `retrieveSimilarResearch(location, propType, researchType)` for previous runs against similar properties. This is the "memory" the platform brags about — each research run's output feeds the next run's context.

The system gracefully degrades. If one panel fails, the other survives (`singlePanelMode`). If both fail, the orchestrator emits an `ORCHESTRATOR_BOTH_FAILED` error and returns — letting the caller fall back to single-model research. I found this failure-handling surprisingly clean for what's otherwise a dense file.

### Phase 2 — API validation

`buildApiValidation(panelA, panelB, mi)` compares each analyst's numeric outputs against live market data that was already injected into `params.marketIntelligence` (from `server/services/MarketIntelligenceAggregator.ts` and the ambient fetchers). Every metric gets a status:

- **`agree`** — both analysts within tolerance
- **`diverge`** — analysts disagree with each other
- **`api-confirms`** — analyst outputs align with live API data
- **`api-contradicts`** — live API data contradicts the analyst estimates

The `consensusRatio` (0-1) is the fraction of metrics where both analysts agreed. That ratio propagates into the synthesis prompt as the "confidence scaffolding" — higher consensus → higher-conviction badges downstream.

### Phase 3 — Synthesis (+1)

**Claude Opus 4.6** (12,000 output tokens). Gets a single massive prompt containing:

- Both panel outputs, formatted side-by-side
- The API validation table
- Similar prior research from Pinecone
- The comps block from Phase 0

And is asked to produce one authoritative JSON research report. Streams directly to the client via SSE — the "typing indicator" the user sees on screen is Opus writing in real time.

The key design bet: **model disagreement is not a bug, it's the error bar.** When Gemini says 72% occupancy and Sonnet says 68%, Opus's job is to say "range 68–72, moderate conviction" rather than pick one. This is why the Analyst Notes always have ranges — the architecture makes single-point estimates structurally impossible.

### Events emitted

The generator yields these event types that the HTTP route forwards to the client as SSE:

- `{ type: "phase", data: "..." }` — progress lines ("Launching parallel research panels", "Validation complete — consensus on 83% of key metrics", etc.)
- `{ type: "content", data: "..." }` — streaming synthesis tokens
- `{ type: "done", data: "..." }` — terminal, includes stored research ID
- `{ type: "error", data: "..." }` — fatal error

This is what the UI renders as the "Studying market trends…" → "Cross-referencing benchmarks…" → answer typing live. The phase names are deliberately human (`"Launching parallel research panels…"`), not technical (`"POST Gemini API"`). That's persona enforcement — the user never sees implementation leakage.

---

## Supporting cast — the layers feeding & surrounding the brain

### HTTP layer

**`server/routes/research.ts`** (854 lines) is the single route file. Key endpoints:

- `POST /api/research/generate` (line 147) — kicks off `orchestrateResearch`, streams events back as SSE. This is what "Consult the Analyst" calls.
- `GET /api/research/status` (line 40) — returns which properties/fields are Due/Overdue/Not-yet-reviewed. Feeds the status bar.
- `GET /api/research/property` (line 130) — fetches stored research for a property.
- `GET /api/research/staleness` (line 97) — staleness classification per field.
- `GET /api/market-research` (line 109) — market-wide intelligence not tied to a specific property.
- `POST /api/research/web-search` (line 785) — live web search (Perplexity/Tavily passthrough).

All routes live behind `requireAuth`. The route file is fat (854 lines) because it also handles cost logging, validation before orchestration, and a non-orchestrator "simple" research path for cases where the full pipeline is overkill.

### Prompt assembly

**`server/ai/research-prompt-builders.ts`** (527 lines) is the system prompt factory. One function per research type (`buildADRPrompt`, `buildCapRatePrompt`, `buildCompensationPrompt`, etc.), plus `buildUserPrompt()` that composes a final user-role prompt. The `RESEARCH_SOURCES` array at the top (line 81) is the authoritative citation registry — Damodaran, CBRE, HVS, AHLA, USALI, S&P Global. I noted earlier this is a superset of the client-side `CITATIONS` object in `shared/citations.ts` (which is about badge labels, not prompt instructions). Intentionally separate — different purposes.

**`server/ai/research-tool-prompts.ts`** — tool-use-mode prompts. When the LLM will be given the 10 deterministic tools, this file builds the system prompt that teaches the model what each tool does and when to call it.

**`server/ai/prompt/assemble-research-prompt.ts`** — composition helper that stitches together skill prompts, context packs, and tool schemas into the final payload.

**`server/ai/context-pack/`** — property-pack, company-pack, types. These are **typed context bundles**. Rather than the orchestrator reading assorted property fields ad-hoc, it requests a `PropertyContextPack` which contains identity, classification, location, physical character, amenity profile, revenue profile, cost profile, etc. — each as a narrative string. The prompt builders consume these narratives, not the raw fields. This separation is why changing how a field *displays* doesn't break how The Analyst *reasons* about it.

### Deterministic math — the "no LLM arithmetic" rule

**`calc/research/`** — 10 pure functions, no I/O, no state:

- `adr-projection.ts`, `cap-rate-valuation.ts`, `cost-benchmarks.ts`, `debt-capacity.ts`, `depreciation-basis.ts`, `make-vs-buy.ts`, `markup-waterfall.ts`, `occupancy-ramp.ts`, `property-metrics.ts`, `service-fee.ts`
- Plus `validate-research.ts` — post-LLM bounds checks that attach a `_validation` summary.

Registered in `calc/dispatch.ts` (single source of truth per `.claude/rules/deterministic-tools.md`). The enforcement rule: anything expressible as a formula must use one of these tools. The LLM's job is to know *which* tool to call and how to *interpret* the result — not to compute the number.

This rule is the secret to why the Analyst's numbers are trustworthy. When Rebecca or The Analyst says "Cap Rate: 8.3%", that number came from `compute_cap_rate_valuation()`, not from "I bet ~8.3% sounds right." That's traceable back to inputs.

### Memory — Pinecone

**`server/ai/vector-store-service.ts`** is the façade. Four namespaces currently indexed:

- `knowledge-base` — the KB chunks (from `kb-content.ts` + attached_assets, after our 5B cleanup)
- `scenarios` — scenario summaries, for "similar deal" retrieval
- `properties` — property profiles
- `comparables` — benchmark snapshots

The orchestrator's Phase 1 parallel step queries `retrieveSimilarResearch()` against what I believe is a `research-history` namespace (I'd need to grep `indexResearchResult` callers to confirm — the name appears in the orchestrator but I haven't traced where it writes).

There's also an admin re-index endpoint at `POST /api/admin/vector-store/reindex/:namespace` (`server/routes/admin/intelligence-vector-store.ts:180`) that **deletes-then-rebuilds** a namespace. That's what the "Re-index" button under Admin → AI Research → System Health triggers.

### Live market data

**`server/ai/ambient/fetchers.ts`** — the 7-source feed list. Xotelo (room rates), CoStar (real estate), FRED (macro), S&P Global, Damodaran (cost of capital + country risk premiums), HVS (hospitality), AHLA (lodging industry). Some are live APIs; some are admin-curated tables with staleness reminders (e.g., Damodaran's 90-day refresh cadence — see `server/ai/market-rates.ts:210`).

These outputs get bundled into `MarketIntelligence` via `server/services/MarketIntelligenceAggregator.ts` before the orchestrator even starts, so both analyst panels see the same baseline market data.

### Value extraction

**`server/ai/research-value-extractor.ts`** + **`server/ai/guidance/{extractor,schemas}.ts`**. Parse the synthesized JSON into typed `assumption_guidance` records: one row per `(propertyId, fieldName, researchRunId)` with range (low/mid/high), confidence tier, data quality score, citations, and free-text reasoning. This is what hydrates the badges — `AnalystRangeIndicator.tsx` reads a guidance record and renders the range pill.

**`dataQuality` JSONB** attached to each guidance record tracks source count, recency, consensus ratio, etc. This is what determines whether a range shows "High" / "Moderate" / "Developing" conviction.

### Governance knobs

**`global_assumptions.researchConfig` JSONB** — admin-configurable per-event behavior. Loaded in `server/routes/research.ts` and threaded into `generateResearchWithToolsStream()` as `eventConfig` on `ResearchParams`. Admins can:

- Enable/disable each research event type (property, company, global)
- Inject focus areas, regions, time horizon, custom instructions
- Restrict which of the 10 deterministic tools are active per event
- Add custom questions the Analyst should consider

Surfaced via **Admin → AI Research → Sources & APIs / LLM Configuration / System Health / Scheduled Research** etc.

### Supporting infrastructure (the quieter files)

- **`llm-registry-manager.ts` + `resolve-llm.ts`** — model selection. Which specific model alias resolves to which API call.
- **`data-routing.ts`** — decides which data source feeds which research type.
- **`research-client.ts`** — generic LLM-call wrapper with retry, timeout, token tracking.
- **`confidence-scorer.ts`** — turns raw evidence signals into conviction tier (High/Moderate/Developing).
- **`staleness-detector.ts`** — decides if a property's guidance is "Up to date / Due for review / Overdue / Not yet reviewed" per the status bar.
- **`analyst-watchdog.ts`** — background monitor; I think this surfaces Admin → System Health metrics but I haven't read it in depth.
- **`analyst-table-refresh.ts`** — scheduled refresh of the admin-curated Analyst Tables (cap rate benchmarks, country risk premiums, etc.).
- **`benchmark-lookups.ts`** — lookup helpers against stored benchmarks.
- **`research-validation.ts`** — post-orchestration validation rules (bounds, sanity checks, cross-field consistency).
- **`source-health-checker.ts`** — probes external APIs for liveness; Admin → Sources & APIs surfaces this.
- **`regenerate-constants.ts`** — the engine for the "sparkle button" Regenerate dialog on Governed Model Constants.

### Client-side rendering

- **`client/src/components/intelligence/AnalystButton.tsx`** — the "Consult the Analyst" trigger.
- **`client/src/components/analyst/AnalystRangeIndicator.tsx`** — the range pill next to each assumption field.
- **`client/src/components/analyst/AnalystValidationBanner.tsx`** — page-level banner summarizing the research.
- **`client/src/components/analyst/ValidationStatusBadge.tsx`** — per-field conviction badge.
- **`client/src/components/intelligence/IntelligenceStatusBar.tsx`** — the "Up to date / Due for review / Overdue / Not yet reviewed" bar.
- **`client/src/components/IndustryResearchTab.tsx`** — the research results surface on property/company pages.

---

## What I find elegant

1. **Model disagreement *is* the confidence band.** Most multi-model systems I've seen pick a winner and discard the loser. This one treats the delta as information. When Gemini and Sonnet agree, the range tightens and conviction goes up; when they diverge, the range widens and conviction drops. This is structurally why the badges always show a range — there's no path in the architecture that produces a single-point estimate.

2. **LLMs don't do arithmetic.** The `.claude/rules/deterministic-tools.md` enforcement (10 pure-function tools in `calc/research/`) means the Analyst's numbers are traceable back to inputs. A user can audit any recommendation by following the tool call chain. This is what makes the platform investor-defensible rather than just "cool AI stuff."

3. **Context packs are narratives, not rows.** `PropertyContextPack` exposes `amenityProfile.narrative`, `revenueProfile.narrative` — hand-composed English sentences, not raw field dumps. The LLM gets coherent paragraphs to reason over, not JSON to parse. Reduces context size and improves relevance.

4. **Phase 0 progressive relaxation.** Strict-then-loose peer matching turns a vague "what's normal in this market?" into "what's normal given these specific comps?" Keeps hallucination risk low.

5. **Graceful single-panel degradation.** If Gemini 500s, Sonnet still produces output and Opus synthesizes from one panel. Users get a worse answer but never a blank screen. This is the kind of resilience that doesn't feel engineered — it just works.

6. **Pinecone as institutional memory.** Each research run feeds the next. The third property in a market gets a better answer than the first because the system remembers what it learned from the first two.

7. **Streaming the synthesis directly to the client.** The user sees Opus writing in real time. This is what makes the "Studying the Medellín luxury market…" UX feel alive rather than canned. Pure engineering bet: SSE + AsyncGenerator + Opus's streaming API. The implementation is a couple hundred lines but the UX payoff is enormous.

---

## What I find fragile / my open questions

I'm writing these as "here's where I'd dig deeper if I had more time" — not as criticisms. Sharing so we're calibrated.

1. **Three-model cost.** Every "Consult the Analyst" click runs Gemini 2.5 Flash + Claude Sonnet 4.5 + Claude Opus 4.6. That's not cheap at scale. I haven't traced whether there's caching on the orchestrator level (only whether individual tool calls cache). If someone clicks 10 times on the same property, do we re-run the full pipeline 10 times? Worth checking.

2. **`research-history` namespace.** The orchestrator queries `retrieveSimilarResearch()` in Phase 1 but I haven't confirmed which namespace that writes to. The admin reindex endpoint handles `knowledge-base`, `scenarios`, `properties`, `comparables` — if `research-history` is a separate namespace it might not be re-indexable via the admin UI. Would be worth tracing `indexResearchResult` callers.

3. **Panel role assignment is hardcoded.** `ANALYST_A_MODEL = "gemini-2.5-flash"` and `ANALYST_B_MODEL = "claude-sonnet-4-5"` are file-level constants with admin override via `modelOverrides`. But the **roles** ("quantitative" vs "market-strategy") are structurally tied to model identity. If an admin swaps to two Anthropic models, what happens to the roles? I believe the role is just a string label passed into the prompt builder — so it should work, but this is one of those places where "flexible by construction" could be a claim that hasn't been tested.

4. **Single-panel fallback quality.** The doc comment says "falling back to single-panel synthesis from Panel X" — but the synthesis prompt is still structured around "here are BOTH panels." Does Opus behave well when one side says `[FAILED]`? I'd want to read the synthesis prompt template specifically for this case to see if there's graceful prompt handling or if it's just "Opus figures it out."

5. **Staleness vs re-run semantics.** The status bar says "Overdue — more than 90 days". What specifically happens when someone clicks "Consult the Analyst" on overdue guidance? Does the old guidance get archived? Overwritten? Appended as a new run? I'd expect an audit trail (`research_runs` table?) but I haven't confirmed the schema.

6. **Cost of `progressive relaxation`.** Each relaxation level involves more DB lookups and probably more Pinecone queries. For a property in a thin market (few comps), does the relaxation engine loop a lot before giving up? If so, there's a latency tail I'd want to measure.

7. **Sync between guidance and the engine.** The financial engine reads assumptions from `globalAssumptions` / `property.*`. The Analyst writes `assumption_guidance` rows. When a user "accepts" a range, does that write into the actual assumption column, or does the engine read from guidance? I *think* the answer is: user explicitly approves, and the explicit value writes to the assumption column — guidance is read-only metadata. But worth confirming.

---

## Reading order for a new agent

If I were briefing a fresh Claude Code session on this code, I'd point them here:

1. **`.claude/rules/the-analyst-persona.md`** — what The Analyst *is* (user-facing definition)
2. **`.claude/skills/research/SKILL.md`** — the 11-layer pipeline overview
3. **`.claude/rules/research-precision.md`** + **`.claude/rules/deterministic-tools.md`** — the enforcement invariants
4. **`server/ai/research-orchestrator.ts`** — read top-to-bottom. This is the brain.
5. **`server/ai/research-prompt-builders.ts`** — see how prompts are composed.
6. **`server/ai/context-pack/property-pack.ts`** — see what context packs look like.
7. **`server/routes/research.ts:147`** (POST handler) — see how the stream is wired to HTTP.
8. **`calc/research/adr-projection.ts`** (or any one tool) — see what a deterministic tool looks like.
9. **`server/ai/research-value-extractor.ts`** — see how synthesis output becomes DB rows.
10. **`client/src/components/analyst/AnalystRangeIndicator.tsx`** — see how a DB row becomes a range pill.

That path takes you from user intent through orchestration through math through storage through rendering. ~2 hours of reading.

---

## Naming / vocabulary note

In this codebase, **The Analyst** (singular, capital T, capital A) refers to the entire pipeline — orchestrator, panels, validation, synthesis, tools, and memory — not to any single model. When users consult The Analyst, they're consulting all of it. The individual LLMs are implementation detail.

**Rebecca** is a distinct agent — the conversational layer, powered by different infrastructure (`server/routes/chat.ts`, `server/ai/rebecca-context-builder.ts`, the RAG pipeline we just cleaned in Phase 5B). Rebecca can explain what The Analyst found, but she does not do the research herself. Keep these separated.

---

## Disclaimer

This is my mental model as of April 2026, built from ~2 hours of directed reading after the user asked "where is the codebase creating the mega powerful analyst?" I haven't exhaustively verified every claim — where I said "I believe" or "I haven't confirmed," that's literal. If something here contradicts the actual code, the code wins.
