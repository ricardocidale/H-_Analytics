---
name: slide-factory-minions
description: >
  Profiles for all five slide factory minions: Aldo (extractor), Bruno
  (renderer), Carlo (validator), Dino (pixel-diff), Enzo (cache). Minions
  are deterministic helpers — they have no LLM and no judgment. Load when
  building or debugging any minion integration.
---

# Slide Factory Minions

Minions are deterministic helpers. They have no LLM, no judgment, and no
autonomy. They do one thing reliably and report the result. Agents call
minions; minions do not call agents.

**Naming rule:** Minion names must not overlap with agent names or orchestrator
names. Current factory agents: Marco, Lorenzo, Lucca, Maya, Sofia, Bianca,
Chiara, Dario, Elisa, Felix. Current minion names: Aldo, Bruno, Carlo,
Dino, Enzo — all distinct.

---

## Aldo — PDF/PPTX Primitive Extractor

**Role:** Document Primitive Extractor
**Type:** Minion (deterministic)
**Called by:** Lorenzo-01

**Short:** Aldo extracts every positioned element from a canonical PDF or
PPTX — text runs, bounding boxes, font metrics, colors, image placements —
using deterministic parsing libraries. No interpretation. Raw ground truth.

**Long:** Aldo is called by Lorenzo-01 when a canonical document is ingested.
For PDFs he uses pdfjs-dist to extract every text run with its coordinates,
font name, font size, font weight, and fill color in the document's coordinate
space, then maps them to the 960×540 canvas. For PPTX files he uses
python-pptx via subprocess. Image placements are extracted with their crop
boxes and aspect ratios. His output is a raw JSON array — no semantic roles,
no groupings, no inferences whatsoever. Aldo is the only factory member that
touches raw file bytes. If the file is corrupted, uses an unsupported encoding,
or contains embedded fonts that cannot be resolved, Aldo returns a structured
error that stops the factory run before any LLM is invoked. His reliability
is the mathematical foundation of the Lorenzo team.

**Output schema:**
```json
{
  "elements": [
    {
      "type": "text" | "image",
      "x": 429, "y": 53.2, "w": 101.1, "h": 33.4,
      "text": "Sul Monte",
      "fontName": "Poppins-ExtraLight",
      "fontSize": 21,
      "fontWeight": 200,
      "color": "#15331F"
    }
  ],
  "slideCount": 6,
  "documentType": "pdf" | "pptx"
}
```

---

## Bruno — PNG Renderer

**Role:** Slide PNG Renderer
**Type:** Minion (deterministic)
**Called by:** Lorenzo-02 (canonical PNGs), each Inspector (rendered slide PNGs)

**Short:** Bruno renders slides to PNG using Playwright. He is called during
canonical ingestion to produce reference PNGs and during inspection to capture
freshly rendered slides. Both uses share the same rendering conditions.

**Long:** Bruno launches a Playwright headless browser context, navigates to
the slide's internal URL with a short-lived render token, waits for
`window.__deckReady === true`, and captures a full-resolution screenshot at
960×540. He enforces a per-slide timeout and handles browser disconnect
retries (up to 2 attempts before returning a structured error). Bruno's output
is a PNG Buffer and the URL he rendered. He does not interpret the output —
he only captures it.

The canonical PNGs (produced by Lorenzo-02 calling Bruno) and the rendered
output PNGs (produced by each Inspector calling Bruno) use identical
Playwright configuration — same viewport, same device scale factor, same
timeout. This ensures Dino's pixel-diff comparison is between two images
produced under identical conditions.

**Output:** `{ png: Buffer, url: string, durationMs: number }`

---

## Carlo — Zod Schema Validator

**Role:** Schema Validator
**Type:** Minion (deterministic)
**Called by:** Lorenzo-04, Lorenzo-03 (integrity check), all -02 Builders

**Short:** Carlo validates JSON structures against named Zod schemas. Called
by Lorenzo-04 to validate the canonical spec, and by every Builder to validate
their `SlidePayload` output before rendering.

**Long:** Carlo is a centralized Zod validation service. He accepts a schema
name (looked up from the canonical schema registry) and a JSON value, and
returns either `{ ok: true, data }` or `{ ok: false, errors: ZodIssue[] }`.
Centralizing validation means schema changes (tightening a character limit,
adding a required slot) take effect everywhere without touching individual
agent code.

Carlo also enforces the numerical-field protection rule for canonical specs:
any field in the `bbox`, `font_size`, or `color` namespaces present in
Lorenzo-01's raw extraction cannot be overwritten by Lorenzo-03, regardless
of Zod validity. This protection is the primary defense against LLM hallucination
corrupting the canonical's mathematical ground truth.

**Schemas Carlo knows:**
- `canonical-spec` — full design contract schema
- `deck-payload-v2` — per-slide slot payload schema
- `slide-factory-run` — factory run record schema

---

## Dino — Pixel-Diff Calculator

**Role:** Pixel-Diff Calculator
**Type:** Minion (deterministic)
**Called by:** Every Inspector agent (Sofia-03, Bianca-03, Chiara-03, Dario-02, Elisa-03, Felix-05) as Pass 1

**Short:** Dino compares two PNGs pixel by pixel using the sharp library and
returns the maximum positional and color delta. He is the mathematical floor
that no LLM can override. ±2px is pass. Anything beyond that is reject.

**Long:** Dino uses the sharp library to composite the canonical PNG and the
rendered PNG, then calculates the maximum pixel deviation in both position
(±px) and color (∆E CIE2000). He returns:
```json
{
  "maxPositionDeltaPx": 1.4,
  "maxColorDelta": 1.8,
  "passedThreshold": true,
  "diffImageBuffer": "<Buffer>",
  "failingRegions": []
}
```

The threshold is ±2px positional and ∆E < 3.0 color — tight enough to catch
real layout drift but lenient enough for sub-pixel antialiasing differences
in headless Chrome. The diff image highlights failing regions in red and is
stored to R2 when a slide fails, surfaced in the admin panel alongside Maya's
rejection note.

Dino is deterministic and has no opinion about whether a slide looks good.
His only question is whether the numbers are within tolerance. He is the
cheapest and fastest check in the inspection pipeline and always runs before
Maya.

---

## Enzo — Content Hash Cache

**Role:** Idempotency Cache
**Type:** Minion (deterministic)
**Called by:** Every LLM agent before invoking its model (Lorenzo-03, Lorenzo-05, Lucca, all -02 Builders, Maya)

**Short:** Enzo computes SHA-256 hashes of agent inputs and checks the factory
cache before any LLM call. Same input → same output, instantly and for free.

**Long:** Enzo implements content-hash idempotency. Before any LLM agent runs,
its orchestrating agent calls Enzo with the full input payload. Enzo computes
`SHA-256(model_id + system_prompt_hash + input_data_json)` and checks the
`slide_factory_cache` table. A cache hit returns the stored output immediately
— no LLM call, no latency, no cost, byte-identical result. A cache miss
proceeds normally and stores the result after completion.

The cache is invalidated when:
- The canonical spec changes (Lorenzo team re-runs)
- The admin manually clears it for a specific agent via the factory admin panel
- The model tier for an agent changes (model_id is part of the hash key)

Enzo ensures that re-running a factory run on identical inputs is free and
byte-identical — critical for the audit log integrity guarantee (Defense F
from the precision pipeline pattern). It also means a failed run can be
resumed from the last non-cached step without re-paying LLM costs for
successful steps.

**Cache table:** `slide_factory_cache (hash TEXT PRIMARY KEY, output JSONB, created_at, agent_name)`
