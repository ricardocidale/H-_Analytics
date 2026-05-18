---
title: Mistral OCR adapter — converting markdown pages to DocumentAIResult shape
date: "2026-05-18"
category: architecture-patterns
module: document-ai-pipeline
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Adding a new OCR provider whose output is markdown-per-page rather than structured entities/tables
  - Routing PDF extraction through Mistral OCR 3 behind the matteo-enable-pdf-ocr-extraction feature flag
  - Keeping downstream consumers (mapExtractionToFields) unchanged while swapping OCR backends
tags:
  - mistral-ocr
  - document-ai
  - adapter-pattern
  - pdf-extraction
  - matteo
  - feature-flag
  - markdown-parsing
---

# Mistral OCR adapter — converting markdown pages to DocumentAIResult shape

## Context

The document analysis pipeline routes PDF extraction through Google Document AI, which returns a `DocumentAIResult` shape with structured tables, entities, and key-value pairs. T3-1 Matteo's `pdf-ocr-extraction` slot added Mistral OCR 3 as a feature-flagged alternative. Mistral OCR returns a different output shape — pages as markdown text — and the downstream consumer `mapExtractionToFields()` expects `DocumentAIResult`. Without an adapter, the Mistral path cannot feed the extraction pipeline without modifying every downstream consumer.

**Shape mismatch:**

```ts
// Mistral OCR output
{ pages: Array<{ index: number; markdown: string }> }

// DocumentAIResult (required by mapExtractionToFields)
interface DocumentAIResult {
  text: string;
  pages: Array<{ pageNumber: number; tables: Array<{ headerRows: string[][]; bodyRows: string[][] }> }>;
  entities: Array<{ type: string; mentionText: string; confidence: number }>;
  keyValuePairs: Array<{ key: string; value: string; confidence: number }>;
}
```

## Guidance

Introduce a `parseMistralOcrPages()` adapter function that converts Mistral's markdown pages into `DocumentAIResult`. The adapter lives alongside the call site that invokes Mistral OCR, not inside `mapExtractionToFields()`.

```ts
/** Confidence score for key-value pairs parsed from Mistral OCR markdown tables.
 *  Algorithm calibration heuristic — not financial, not admin-configurable. */
const MISTRAL_OCR_TABLE_CONFIDENCE = 0.8;

function parseMistralOcrPages(
  ocrPages: Array<{ index: number; markdown: string }>,
): DocumentAIResult {
  const pages: DocumentAIResult["pages"] = [];
  const keyValuePairs: DocumentAIResult["keyValuePairs"] = [];
  let fullText = "";

  for (const page of ocrPages) {
    fullText += page.markdown + "\n";
    const bodyRows: string[][] = [];

    for (const line of page.markdown.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
      if (/^\|[-|:\s]+\|$/.test(trimmed)) continue; // skip GFM separator rows (|---|---|)
      const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      bodyRows.push(cells);
      if (cells.length === 2) {
        // 2-column rows have a natural key/value reading
        keyValuePairs.push({ key: cells[0], value: cells[1], confidence: MISTRAL_OCR_TABLE_CONFIDENCE });
      }
    }

    if (bodyRows.length > 0) {
      pages.push({ pageNumber: page.index + 1, tables: [{ headerRows: [], bodyRows }] });
    }
  }

  return { text: fullText, pages, entities: [], keyValuePairs };
}
```

**Key design decisions:**

| Decision | Rationale |
|---|---|
| Separator rows skipped via `/^\|[-\|:\s]+\|$/` | GFM markdown table separators (`\|---\|---\|`) are structural, not data |
| `headerRows: []` (empty) | Mistral OCR markdown does not distinguish header rows from body rows |
| `entities: []` | Mistral OCR does not emit structured entity extraction; do not invent values |
| `keyValuePairs` from 2-column rows only | Two-cell rows have a natural key/value reading; wider rows are ambiguous |
| `pageNumber: page.index + 1` | Mistral page indexes are 0-based; `DocumentAIResult` convention is 1-based |
| `MISTRAL_OCR_TABLE_CONFIDENCE = 0.8` | Named calibration constant — algorithm heuristic, not a financial value, so a TypeScript constant is appropriate under CLAUDE.md §2 |

**Feature-flag wiring at the call site:**

```ts
const useMistralOcr =
  (await getParameterValue("matteo-enable-pdf-ocr-extraction", 0)) !== 0 &&
  extraction.fileContentType === "application/pdf";

let result: DocumentAIResult;
if (useMistralOcr) {
  const { buffer } = await storageProvider.downloadBuffer(extraction.objectPath);
  const startTime = Date.now();
  const ocrClient = await getMistralOcrClient();
  const ocrResult = await ocrClient.extractText({
    pdfBase64: buffer.toString("base64"),
    documentName: extraction.fileName,
  });
  result = parseMistralOcrPages(ocrResult.pages);
  logApiCost({
    timestamp: new Date().toISOString(),
    service: "mistral",
    operation: "pdf-ocr-extraction",
    estimatedCostUsd: ocrResult.pages.length * unitCost("mistral-ocr-page"),
    durationMs: Date.now() - startTime,
    route: "documents",
  });
} else {
  result = await documentAIService.processDocument(extraction.objectPath, extraction.fileContentType);
}
```

Non-PDF files always use the existing DocumentAI path regardless of the flag.

## Why This Matters

The adapter isolates the impedance mismatch at the provider boundary — `mapExtractionToFields()` and all downstream extraction logic remain unchanged when OCR backends change. Without this pattern, each provider's output format leaks into the extraction layer, producing a multi-provider conditional spread through generic field-mapping logic.

The feature-flag check (`getParameterValue`) reads the DB on every call (no in-memory cache), so toggling the flag takes effect on the next request without a server restart. Cost attribution is preserved in both paths via `logApiCost()`.

## When to Apply

Apply this adapter pattern when:
- A new OCR provider outputs markdown, plain text, or any per-page unstructured format
- `mapExtractionToFields()` or any code expecting `DocumentAIResult` must remain unchanged
- The provider is gated behind a feature flag (the adapter is the seam that makes the flag a single conditional at the call site)

Do **not** apply if the new provider already returns a `DocumentAIResult`-compatible shape, or if the downstream extraction layer is being replaced as part of the same unit of work.

## Examples

**Correct — Mistral OCR output flows through adapter before reaching extraction:**
```ts
const result = parseMistralOcrPages(mistralResponse.pages);
const fields = mapExtractionToFields(result, property);
```

**Wrong — passing Mistral output directly:**
```ts
// TypeScript error: { pages: { index, markdown }[] } is not DocumentAIResult
const fields = mapExtractionToFields(mistralResponse, property);
```

**Wrong — embedding markdown-parsing inside `mapExtractionToFields()`:**
```ts
// Leaks Mistral's format into the generic extraction layer
// Every future provider change touches the same function
function mapExtractionToFields(result: DocumentAIResult | MistralOcrResponse) { ... }
```

## Related

- `docs/solutions/architecture-patterns/matteo-multi-vendor-llm-slot-routing-2026-05-16.md` — upstream context: how the `pdf-ocr-extraction` slot, Mistral OCR vendor case, and feature-flag seeding work in the Matteo dispatch layer. This doc is the downstream complement.
- Implemented in `artifacts/api-server/src/routes/documents.ts` — `parseMistralOcrPages()` function and modified `runAnalysisPipeline()`.
