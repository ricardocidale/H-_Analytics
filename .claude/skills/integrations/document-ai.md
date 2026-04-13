---
name: document-intelligence
description: Google Document AI OCR pipeline for extracting financial data from scanned documents. Covers processing pipeline, field mapping, confidence scoring, templates, and review UI. Load when working on document extraction, OCR, or the property Documents tab.
---

# Document Intelligence Pipeline

## Purpose

Documents the OCR pipeline that extracts structured financial data from scanned documents (P&Ls, appraisals, operating statements) and maps extracted fields to property assumptions. Uses Google Document AI for OCR and a custom field mapper for USALI-aligned extraction.

## Key Files

| File | Purpose |
|------|---------|
| `server/integrations/document-ai.ts` | `DocumentAIService` — extends `BaseIntegrationService`, OCR processing |
| `server/document-ai/field-mapper.ts` | `mapExtractionToFields()` — maps OCR output to property assumption fields |
| `server/document-ai/templates.ts` | `DOCUMENT_TEMPLATES` — extraction templates per document type |
| `server/routes/documents.ts` | API routes: upload, extract, review, approve/reject fields |
| `server/storage/documents.ts` | `DocumentStorage` — extraction and field persistence |

## Architecture

```
Upload (binary POST with headers)
  ↓
Object Storage (Replit) — store original file
  ↓
DocumentAIService.processDocument(buffer, contentType)
  ↓
Google Document AI API → DocumentAIResult
  ↓
mapExtractionToFields(result, template) → ExtractionField[]
  ↓
Store in document_extractions + extraction_fields tables
  ↓
Review UI → Approve/Reject individual fields
  ↓
Apply approved fields to property assumptions
```

## DocumentAIResult Type

```typescript
interface DocumentAIResult {
  text: string;                    // Full extracted text
  pages: Array<{
    pageNumber: number;
    tables: Array<{
      headerRows: string[][];
      bodyRows: string[][];
    }>;
  }>;
  entities: Array<{
    type: string;
    mentionText: string;
    confidence: number;            // 0-1
  }>;
  keyValuePairs: Array<{
    key: string;
    value: string;
    confidence: number;            // 0-1
  }>;
}
```

## Field Mapping

`mapExtractionToFields()` maps OCR key-value pairs to property assumption fields using fuzzy matching against USALI-aligned templates. Each mapped field includes:

- **Field name**: Target property assumption field
- **Extracted value**: Raw value from OCR
- **Confidence level**: High (>0.9), Medium (0.7-0.9), Low (<0.7)
- **Status**: Pending → Approved/Rejected (user review)

### Confidence Levels

| Level | Threshold | UI Treatment |
|-------|----------|-------------|
| High | > 0.9 | Green badge, auto-approve suggested |
| Medium | 0.7 - 0.9 | Yellow badge, manual review required |
| Low | < 0.7 | Red badge, likely needs correction |

## Supported File Types & Limits

| Constraint | Value |
|-----------|-------|
| Allowed types | PDF, PNG, JPEG, TIFF, WebP |
| Max file size | 20 MB |
| Rate limit | 3 extractions per minute per user |
| Auth | `requireManagementAccess` |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `DOCUMENT_AI_LOCATION` | Processor region (default: "us") |
| `DOCUMENT_AI_PROCESSOR_ID` | Document AI processor ID |

All three must be set for the service to be configured. `isConfigured()` checks all three.

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/documents/extract` | POST | requireManagementAccess | Upload and extract document (binary body) |
| `/api/documents/extractions/:propertyId` | GET | requireAuth | List extractions for property |
| `/api/documents/extractions/:id/fields` | GET | requireAuth | Get extracted fields |
| `/api/documents/fields/:id/status` | PATCH | requireManagementAccess | Approve/reject a field |

Upload uses raw binary body with metadata in headers:
- `Content-Type`: File MIME type
- `X-Property-Id`: Target property ID
- `X-File-Name`: Original filename

## Integration Pattern

`DocumentAIService` extends `BaseIntegrationService` from `server/integrations/base.ts`, providing:
- Circuit breaker (5 failures in 60s → open, 30s cooldown)
- Retry with exponential backoff
- Health check for Admin → Integrations tab
- Sentry span tracing

## Database Tables

| Table | Purpose |
|-------|---------|
| `document_extractions` | Extraction metadata: property, file, status, timestamps |
| `extraction_fields` | Individual extracted fields: name, value, confidence, status |

## Related Skills

- `.claude/skills/market-intelligence/adding-integrations.md` — BaseIntegrationService pattern
- `.claude/skills/admin/SKILL.md` — Admin Integrations health tab
