# Phase 5B — Delete orphan KB directory + port 4 high-value chunks

**Status:** Ready to execute.
**Owner:** Replit Agent.
**Prerequisites:** Phase 5C merged (`6a18d8cf`).

---

## Why — important context

Phase 5B was originally scoped as "strip baked defaults from `server/ai/kb/19-financial-formulas.md` so Rebecca queries live values." While drafting, Claude Code discovered that **the entire `server/ai/kb/` directory is orphaned** — not loaded by any code path. Rebecca's RAG pipeline (`server/ai/knowledge-base.ts:145-152`) only pulls from:

1. `server/ai/kb-content.ts` — inline chunks (`extractMethodologyContent`, `extractCheckerManualContent`, `extractPlatformGuide`)
2. `attached_assets/*.md|txt`

The 19 markdown files in `server/ai/kb/` were added in commit `640e889f` and never wired up. A content delta analysis of all 19 found:

- **11 files** (02, 04, 05, 06, 07, 08, 09, 14, 17, 18) are pure duplicates of `kb-content.ts`
- **1 file** (03) has one minor addition (3-tier inflation cascade note)
- **3 files** (10, 12, 16) have modest additions (citations/role details) — defer to a later phase if needed
- **1 file** (19) contains the `8.5%/12%/HVS 2024` drift we were worried about — but since nothing reads it, there was never any drift
- **4 files** (01, 11, 13, 20) contain **substantively valuable content not in `kb-content.ts`** and worth porting before deletion

This handoff ports those 4, then deletes the whole `server/ai/kb/` directory.

---

## Task list

### Task 5B-1 — Port 4 high-value chunks into `kb-content.ts`

Edit `server/ai/kb-content.ts`. Append each of the 4 chunks below to `extractMethodologyContent()` (before the final `return chunks;` line).

Each chunk uses the exact same shape as existing entries:

```ts
chunks.push({
  title: "...",
  content: `...`,
  source: "...",
  category: "...",
});
```

**Vocabulary compliance is mandatory.** The orphan source files use some phrasing that violates `.claude/rules/branding-vocabulary-enforcement.md` (e.g. `"Ask the Analyst"` as a literal in code, plural `"analysts"`). The content below is already cleaned. **Do not copy-paste from the orphan files — use the text in this handoff verbatim.**

#### Chunk 1 — Founder & Company Background

```ts
chunks.push({
  title: "Founder & Company Background",
  content: `H+ Analytics is built by Norfolk AI. The founder is Ricardo Cidale — a serial entrepreneur, published author, and tech executive based in Austin, Texas. He holds engineering degrees from Texas A&M (civil + structural), an MBA from Syracuse University's Whitman School of Management, and a master's in corporate governance from IBMEC in Brazil. He's a member of Chi Epsilon and Tau Beta Pi honor societies.

Ricardo has built, merged, and sold multiple tech companies (LabOne Systems, OTT Networks, UUX Systems) and held senior executive roles at Hewlett Packard, Dell, and RealNetworks across Barcelona, São Paulo, Austin, Madrid, Miami, Mexico City, Milan, and Seattle — managing P&Ls over $200M and teams of hundreds. Before Norfolk AI, he was Chief Revenue Officer at First Orion Corporation. Two-time Executive of the Year in Digital Media Software. Published author with McGraw-Hill ("Digital Virus", "The Wizard of DOS"). Venture Partner at Synapse Venture Capital since 2019. Mentor at Capital Factory (Austin) and MassChallenge.

Ricardo is not a developer — he's a builder who created this entire platform in partnership with Anthropic's Claude Code. He thinks in business terms, revenue models, and investor returns. His hospitality portfolio spans Medellín, Cartagena, New York, and Utah. When he asks a question, he's thinking like an LP evaluating a deal, not an engineer debugging code.

The portal is a closed system — only pre-approved users added by an admin can access it. There is no public sign-up.`,
  source: "Platform Guide",
  category: "methodology",
});
```

#### Chunk 2 — International Depreciation Periods

```ts
chunks.push({
  title: "International Depreciation Periods",
  content: `The depreciation calculation method always follows US GAAP (ASC 360, straight-line). Only the useful life period varies by jurisdiction. Each country's tax authority determines the allowable recovery period for commercial real property (hotels).

For US properties, hotels are classified as nonresidential real property under IRC §168(e)(2)(A). The IRS-mandated depreciation period is 39 years using straight-line MACRS. This is different from residential rental property (apartments, houses), which uses 27.5 years. Hotels are explicitly nonresidential because transient lodging (stays under 30 days) does not qualify as residential.

For international properties, the depreciation period is set by the local tax authority:
- Colombia: 20 years (Estatuto Tributario Art. 137)
- Mexico: 20 years (Ley del ISR Art. 34)
- Brazil: 25 years (RIR/2018 Art. 311)

Cost segregation is an IRS-approved method that accelerates depreciation by reclassifying building components (e.g., FF&E, land improvements, specialty mechanical systems) into shorter MACRS recovery periods (5, 7, or 15 years instead of 39 years). The model does not perform cost segregation analysis but users should be aware it may reduce effective tax burden. A cost segregation study requires a qualified engineer and is most beneficial for properties with a purchase price above $1 million.

FF&E depreciates over a shorter useful life, typically 5 to 7 years. The FF&E reserve set aside each year funds these replacements. When actual FF&E replacements occur, they are capitalized and depreciated over their useful life.

Depreciation recapture on sale: when a property is sold, the IRS recaptures some of the depreciation benefit under IRC §1250. The gain attributable to prior depreciation deductions is taxed at a maximum rate of 25% — higher than the long-term capital gains rate. Sometimes called "unrecaptured Section 1250 gain."`,
  source: "Platform Guide",
  category: "methodology",
});
```

#### Chunk 3 — Research Workflow & Conviction Levels

```ts
chunks.push({
  title: "Research Workflow & Conviction Levels",
  content: `The platform includes The Analyst — an AI agent that reviews property assumptions against real market data: comparable hotels, seasonal patterns, labor costs, cap rate transactions, and industry benchmarks.

When the user consults The Analyst on a property or company page, the research pipeline runs live. The user sees what's happening in real time: "Studying the market", "Cross-referencing industry benchmarks", "Getting a second opinion from independent sources". Each step pulls data from multiple verified sources.

The results appear as Analyst Notes — small badges next to each assumption field showing the range The Analyst recommends. Each note includes a conviction level:
- **High conviction** — strong market evidence from multiple sources that agree
- **Moderate conviction** — data exists but sources disagree or the data is older
- **Developing** — limited data; the recommendation is based on broader benchmarks while The Analyst gathers more

The user's numbers are always their own. Analyst Notes never change assumptions automatically. The user reviews what The Analyst suggests and decides. The financial engine only uses numbers the user has explicitly approved.

The platform gets smarter with every property added. When The Analyst discovers market data during a research run, that data gets stored locally. Next time a property in the same market needs research, the data is already there — faster, cheaper, higher conviction.

The review status bar tells the user how current the analyst review is:
- **Up to date** — The Analyst reviewed recently and nothing has changed
- **Due for review** — assumptions have changed or time has passed since the last review
- **Overdue** — it's been more than 90 days; market conditions may have shifted
- **Not yet reviewed** — The Analyst hasn't looked at these assumptions yet

The user can consult The Analyst again anytime — it will check for updated data and refresh its view.`,
  source: "Platform Guide",
  category: "methodology",
});
```

#### Chunk 4 — Governed Model Constants

```ts
chunks.push({
  title: "Governed Model Constants",
  content: `The portal distinguishes two layers of financial values:

- **Investor assumptions** — what an investor believes about a market or property (occupancy, ADR, growth rates, fees). These live on the property and on Company Assumptions and follow the per-property → systemwide → constant cascade.
- **Governed Model Constants** — accounting and regulatory standards (Days per Month, Depreciation Years). These live in Admin → Model Defaults → Model Constants. They are not editable from property pages or Company Assumptions.

Registered Model Constants today:
- **Days per Month** — 30.5, universal industry convention (365 ÷ 12). Used wherever occupied room-nights convert between monthly and annualized rates.
- **Depreciation Years** — country-specific. 39 years for US hotels under IRC §168(e)(2)(A) MACRS; 20 years in Colombia and Mexico; 25 years in Brazil. See the country defaults table for the full citation list.

Each governed constant shows a three-state badge describing where its current effective value comes from:
- **Factory** — the built-in default from the shared constants file. The starting point if nothing else has been set.
- **Analyst** — a value researched and proposed by The Analyst, with a citation captured in the audit trail. Confirmed by an admin via the Regenerate dialog.
- **Manual** — an admin typed the value in directly. Highest precedence; overrides both Analyst and Factory.

Resolution precedence: Manual override > Analyst override > Factory value, evaluated per-locality (universal, country, or country+state) where applicable.

The sparkle button on each row opens the Analyst regeneration dialog. The Analyst produces a typed proposal: the new value, the reasoning, and a list of grounded web sources. The admin reviews and confirms before anything is persisted. If The Analyst confirms the current value is correct, no change is saved.

How values reach the engine: the admin's confirmed value is overlaid onto the global assumptions object on the server at every engine boundary — finance routes, scenario compute/recompute, exports, sensitivity analysis, and the verification audit. The server is authoritative. Even if a client sends a stale Days per Month in its request payload, the engine substitutes the admin-governed value before computing.`,
  source: "Platform Guide",
  category: "methodology",
});
```

### Task 5B-2 — Delete the orphan directory

After Task 5B-1 is committed and the tests pass:

```bash
rm -rf server/ai/kb/
```

Verify nothing references the directory anymore:

```bash
rg "server/ai/kb/" --hidden -g '!.claude' -g '!.git'
```

Expected: zero hits in application code. `.claude/` and `.git/` hits are fine (docs, history).

### Commit strategy

**Two commits**, in order:

1. **Commit A** — port content:
   > `audit phase 5b: port 4 high-value KB chunks into kb-content.ts`
   >
   > `Adds Founder & Company Background, International Depreciation Periods,`
   > `Research Workflow & Conviction Levels, and Governed Model Constants`
   > `chunks to extractMethodologyContent(). Content ported from the orphaned`
   > `server/ai/kb/ directory (01, 11, 13, 20) with vocabulary cleanup and`
   > `no baked numeric defaults. Rebecca will surface this content on next`
   > `KB re-index.`
   >
   > `Surfaces: S9, S8`

2. **Commit B** — delete orphans:
   > `audit phase 5b: remove orphaned server/ai/kb/ directory`
   >
   > `The 19 markdown files in server/ai/kb/ were added in commit 640e889f`
   > `but never wired into the RAG pipeline. server/ai/knowledge-base.ts`
   > `only reads from kb-content.ts + attached_assets/. High-value unique`
   > `content from 4 files was ported in the previous commit. The remaining`
   > `15 files are duplicates or deferrable content. Deleting eliminates a`
   > `~900-line documentation orphan that has misled the last two audits.`
   >
   > `Surfaces: S9`

### Task 5B-3 — Trigger KB re-index

After Commit B merges to main, trigger a re-index of the `knowledge-base` namespace so the new chunks are embedded into Pinecone:

```bash
curl -X POST http://localhost:5000/api/admin/vector-store/reindex/knowledge-base \
  -H "Cookie: <admin session cookie>"
```

Or use the Admin UI: **Admin → System Intelligence → Reindex** next to the `knowledge-base` namespace.

Expected response:
```json
{ "success": true, "namespace": "knowledge-base", "chunksIndexed": <N>, "timeMs": <ms> }
```

`N` should increase by ~4 from the previous value (one per new chunk, possibly more if any of the new chunks are split by the chunker).

This is a runtime operation, not a commit.

---

## Verification (after Commit A, after Commit B, and after re-index)

```bash
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
npm run verify:summary
```

Expected:
- TypeScript: 0 errors
- Lint: 0 warnings
- Vocabulary: 11/11 pass
- test:summary: all pass
- verify:summary: **UNQUALIFIED**

### Manual Rebecca smoke tests (after re-index)

Open the Rebecca chat panel and ask each of these. Confirm the answer draws on the new content:

1. **"Who built H+ Analytics?"** — should mention Ricardo Cidale, Norfolk AI, Claude Code partnership.
2. **"What's the depreciation period for a hotel in Colombia?"** — should say 20 years, cite Estatuto Tributario Art. 137.
3. **"What does 'moderate conviction' mean on an Analyst Note?"** — should explain the conviction tiers and that moderate means sources disagree or data is older.
4. **"What's the difference between an investor assumption and a Model Constant?"** — should explain the two-layer model and the Factory/Analyst/Manual badge.

If any answer is generic or cites `kb-content.ts` content that *doesn't* include the new chunks, the re-index didn't pick them up. Re-run Task 5B-3.

---

## Anti-patterns / gotchas

1. **Do not copy-paste from orphan source files.** The orphan files use phrases like `"Ask the Analyst"` (literal — forbidden in code per vocabulary rule) and plural `"analysts"` / `"your analysts"` (forbidden per persona rule). The handoff above has already rewritten these. Use the handoff text verbatim.

2. **Do not port `19-financial-formulas.md`.** That file contains the baked `8.5% / 12% / HVS 2024` defaults that were the original drift target. The user's product decision (option 1) was: Rebecca should query live values, not recite stale defaults. The formula structure is already in `kb-content.ts` in a correctly abstract form.

3. **Do not port `10-statements.md`, `12-accounting.md`, `16-roles.md`.** These have modest additions but are deferrable. If Rebecca is observed giving weak answers in those areas later, port then. Don't port speculatively.

4. **Do not recreate `server/ai/kb/`.** If a future feature needs file-based KB, add a real loader function AND migrate content there as one atomic change. Don't leave orphans.

5. **The re-index endpoint deletes the namespace first** (see `server/routes/admin/intelligence-vector-store.ts:195-202`). Don't worry about the "skip re-index if vectors exist" branch in `indexKnowledgeBase` — the admin endpoint clears first, then re-indexes.

6. **No new constants file is needed.** This is a content migration + directory deletion. No `DEFAULT_*` additions. No schema changes.

---

## After completion

1. Update `.claude/audit-inventory.md`:
   - Under the current-state table, mark Phase 5B as **✅ complete**.
   - Append a `### D-2-B closed` block with the two commit SHAs and re-index result.
2. Append a ≤5-line note to `.claude/session-memory.md` with commit SHAs, chunks ported, and re-index chunk count delta.
3. Ping Claude Code: "Phase 5B done. Orphans deleted, 4 chunks ported, KB re-indexed. Awaiting next-phase direction."