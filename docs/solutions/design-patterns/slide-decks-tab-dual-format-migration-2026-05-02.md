---
title: "Migrating a single-format download UI to dual-format (property slide decks)"
date: "2026-05-02"
category: docs/solutions/design-patterns
module: admin/SlideDecksTab
problem_type: design_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - A downloadable resource gains a format or variant dimension (e.g. pptx vs image-pptx)
  - A status map previously keyed by a single entity ID needs to be keyed by entity+format
  - A single download button per card needs to split into one button per format
  - An auto-generate side-effect (useEffect) is being replaced by server-side pre-generation
tags:
  - slide-decks
  - dual-format
  - download-state
  - status-map
  - react
  - admin-ui
  - property-slides
---

# Migrating a single-format download UI to dual-format (property slide decks)

## Context

`SlideDecksTab` was originally built for a single PPTX format per property. The
backend evolved to support two independent formats — `pptx` (editable, Python
generator) and `image` (image-locked PPTX via satori + @resvg/resvg-js) — stored
in the `property_slide_deck_variants` table with a composite PK of
`(property_id, format)`.

The `/api/slides/status` endpoint now returns an array of `{ propertyId, format,
status, ... }` objects — one row per `(property, format)` pair instead of one row
per property. The UI needed to be migrated to handle independent status, download
state, and action buttons for each format.

Simultaneously, the auto-generate `useEffect` (which fired on page load for any
property without a `ready` record) was removed because slides are now pre-generated
at server startup. Keeping the effect would cause unnecessary duplicate generation
requests.

## Guidance

### 1. Add `format` to the status type

```typescript
// Before
interface SlideStatus {
  propertyId: number;
  status: "idle" | "generating" | "ready" | "error";
  // ...
}

// After
interface SlideStatus {
  propertyId: number;
  format: "pptx" | "image";
  status: "idle" | "generating" | "ready" | "error";
  // ...
}
```

### 2. Key the status map by `"${propertyId}-${format}"`

```typescript
// Before — one entry per property, format collision risk
const statusMap = new Map<number, SlideStatus>(
  (slideStatuses ?? []).map(s => [s.propertyId, s]),
);

// After — one entry per (property, format) pair
const statusMap = new Map<string, SlideStatus>(
  (slideStatuses ?? []).map(s => [`${s.propertyId}-${s.format}`, s]),
);
```

All reads must use the same compound key:

```typescript
const pptxStatus  = statusMap.get(`${p.id}-pptx`);
const imageStatus = statusMap.get(`${p.id}-image`);
```

### 3. Key download state by `"${propertyId}-${format}"`

```typescript
// Before
const [downloadStates, setDownloadStates] = useState<Record<number, DownloadState>>({});

// After
const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

// Read/write with compound key
const dlStatePptx  = downloadStates[`${p.id}-pptx`]  ?? "idle";
const dlStateImage = downloadStates[`${p.id}-image`] ?? "idle";
```

### 4. Pass `format` into `handleDownload`

```typescript
async function handleDownload(
  propertyId: number,
  propertyName: string,
  format: "pptx" | "image",
) {
  const key = `${propertyId}-${format}`;
  setDownloadState(key, "loading");

  const resp = await fetch(
    `/api/properties/${propertyId}/slides?format=${format}`,
    { credentials: "include" },
  );

  const slug = propertyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filename =
    format === "image" ? `${slug}-slides-images.pptx` : `${slug}-slides.pptx`;
  // ... blob save logic unchanged
}
```

### 5. Render two download buttons, two status badge rows

```tsx
{/* Two labeled status rows */}
<div className="flex flex-col gap-1">
  <div className="flex items-center gap-1.5">
    <span className="text-[10px] text-muted-foreground w-10">PPTX</span>
    <SlideStatusBadge slide={statusMap.get(`${p.id}-pptx`)} />
  </div>
  <div className="flex items-center gap-1.5">
    <span className="text-[10px] text-muted-foreground w-10">Images</span>
    <SlideStatusBadge slide={statusMap.get(`${p.id}-image`)} />
  </div>
</div>

{/* Two download buttons, each with its own loading/done/error state */}
<div className="flex items-center gap-2">
  <Button
    disabled={!isPptxReady || dlStatePptx === "loading"}
    onClick={() => handleDownload(p.id, p.name, "pptx")}
  >
    Download PPTX
  </Button>
  <Button
    disabled={!isImageReady || dlStateImage === "loading"}
    onClick={() => handleDownload(p.id, p.name, "image")}
  >
    Download Images
  </Button>
</div>
```

### 6. `isGenerating` checks both formats

```typescript
const isGenerating =
  pptxStatus?.status  === "generating" ||
  imageStatus?.status === "generating" ||
  generateMutation.variables === p.id;
```

### 7. `freshnessFromStatus` uses the pptx format as the canonical signal

```typescript
const freshness = freshnessFromStatus(pptxStatus);
```

The Analyst button regenerates both formats; pptx is used as the freshness
signal because it is the authoritative (editable) format.

### 8. Remove the auto-generate `useEffect` when server handles pre-generation

If slides are pre-generated at server startup (via a startup task that calls
`POST /api/properties/:id/slides/generate` for all `idle` variants), the
client-side `useEffect` that fires generate requests on page load is redundant
and should be removed along with its `autoQueuedRef` and `autoGeneratingIds`
state. Remove `useEffect` and `useRef` from the import if they are no longer
used.

## Why This Matters

- **Keying errors are silent.** If you keep `Map<number, SlideStatus>` after the
  backend starts returning two rows per property, the second row silently
  overwrites the first. The pptx status would always reflect the image status
  (or vice versa) depending on array order.
- **Download state collision.** Keeping `Record<number, DownloadState>` means
  clicking "Download Images" visually updates the PPTX button's state. Both
  buttons share one loading/done indicator, confusing the user.
- **Stale auto-generate logic causes double generation.** The server startup
  task and the client `useEffect` would both fire `POST
  /api/properties/:id/slides/generate` for the same properties, wasting
  generation time and potentially causing race conditions.

## When to Apply

- Any admin tab that downloads a resource that now has a `format` or `variant`
  dimension (e.g. CSV vs XLSX, full vs preview, pptx vs image-pptx).
- Any status poll that changes from returning one row per entity to one row per
  `(entity, variant)` pair.
- Any page that previously auto-triggered generation on load, when that
  responsibility moves to server startup or a background job.

## Examples

### Status map lookup — before vs after

```typescript
// Before: single format, keyed by number
const slide = statusMap.get(p.id);

// After: dual format, keyed by compound string
const pptxStatus  = statusMap.get(`${p.id}-pptx`);
const imageStatus = statusMap.get(`${p.id}-image`);
```

### Download filename convention

| format  | filename pattern                   |
|---------|------------------------------------|
| `pptx`  | `{slug}-slides.pptx`               |
| `image` | `{slug}-slides-images.pptx`        |

## Related

- `claude.md` § "LB Slides — per-property PPTX + image-PPTX generator" — full
  architecture, DB schema, API routes, generation pipeline
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`
  — companion pattern doc for the AI side of the same feature set
- `artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx`
  — the component this pattern was extracted from
