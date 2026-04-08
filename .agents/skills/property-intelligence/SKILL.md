---
name: property-intelligence
description: Property data enrichment pipeline for H+ Analytics — address autocomplete, geocoding, auto-fill, URL management with validation, image enhancement (AI upscaling), AI description rewrite, map/3D location links, and how these feed into the research engine. Use when building, modifying, or debugging any property data enrichment feature.
---

# Property Intelligence Pipeline

## Overview

The property intelligence pipeline enriches raw property data through a series of automated and user-initiated steps. Each stage adds structured, validated data that feeds downstream into the research engine, financial modeling, and portfolio presentation.

```
Address Input → Autocomplete → Geocode → Auto-Fill Fields
                                           ↓
                                    Map & 3D Links
                                           ↓
URL Management → Validation → Relevance Scoring → Research Sources
                                           ↓
Photo Upload → AI Enhancement → Accept/Reject → Variant Generation
                                           ↓
Description → AI Rewrite → Accept/Dismiss → Portfolio Display
```

---

## Stage 1: Address Autocomplete & Geocoding

### Flow
1. User types street address in `BasicInfoSection`
2. `AddressAutocomplete` component queries Google Places API via `GET /api/places/autocomplete`
3. User selects a suggestion
4. Place details (lat/lng, city, state, zip, country) extracted from response
5. Empty fields auto-filled via `fillIfEmpty()` — preserves user-entered data
6. Lat/lng immediately persisted via `PATCH /api/properties/:id/coords`

### Key Files

| File | Purpose |
|------|---------|
| `client/src/components/AddressAutocomplete.tsx` | Autocomplete input with AbortController, countryBias, debounce |
| `client/src/components/property-edit/BasicInfoSection.tsx` | Auto-fill logic, coord persistence, "auto-filled" badges |
| `server/integrations/geospatial.ts` | `placesAutocomplete(query, countryBias?)` — wraps Google Places API |
| `server/routes/geospatial.ts` | `GET /api/places/autocomplete?q=&country=` |
| `server/routes/properties.ts` | `PATCH /api/properties/:id/coords` — lat/lng persistence |

### Patterns
- **Country bias**: `countryBias` prop scopes Google Places results to selected country (`&components=country:XX`)
- **Stale response protection**: AbortController cancels in-flight requests on new keystrokes
- **Auto-fill badges**: Green "auto-filled" pill + emerald ring highlight shown for 6 seconds, then fades
- **Immediate coord persistence**: Lat/lng saved to DB immediately on place selection (not deferred to form save)

---

## Stage 2: Map & 3D Location Links

### Flow
1. After geocoding, property has lat/lng coordinates
2. `hasCoordinates(property)` checks for valid, finite lat/lng values
3. `buildLocationLinks(lat, lng)` generates Google Maps and Google Earth 3D URLs
4. Links rendered on both portfolio card (icon buttons) and property detail (pill buttons)

### Key Files

| File | Purpose |
|------|---------|
| `client/src/lib/map-utils.ts` | `buildLocationLinks()`, `hasCoordinates()` utilities |
| `client/src/components/portfolio/PortfolioPropertyCard.tsx` | Inline IconMap + IconGlobe buttons next to location |
| `client/src/pages/PropertyDetail.tsx` | "Google Maps" and "3D Flyover" pill links above PropertyMap |

### URL Formats
- **Google Maps**: `https://www.google.com/maps/search/?api=1&query={lat},{lng}`
- **Google Earth 3D**: `https://earth.google.com/web/@{lat},{lng},500a,800d,35y,0h,60t,0r`
  - `500a` = altitude 500m, `800d` = distance 800m, `35y` = yaw 35°, `60t` = tilt 60°

### Coordinate Validation
`hasCoordinates()` accepts any finite number (including 0) for lat/lng. Only `null`, `undefined`, `NaN`, and `Infinity` are rejected.

---

## Stage 3: URL Management & Validation

### Flow
1. User adds URLs via `PropertyLinksSection` in property edit
2. URLs validated client-side (http/https only) + server-side duplicate check
3. Batch validation via `POST /api/properties/:id/urls/validate` — GET requests (15s timeout) with SSRF protection
4. AI-based relevance scoring with heuristic domain fallback for known hospitality sites
5. Validated URLs displayed on portfolio cards and property detail with status badges

### Key Files

| File | Purpose |
|------|---------|
| `shared/schema/properties.ts` | `property_urls` table schema |
| `server/storage/property-urls.ts` | PropertyUrlStorage CRUD class |
| `server/routes/properties.ts` | 5 URL endpoints (list, add, update, delete, validate) |
| `client/src/components/property-edit/PropertyLinksSection.tsx` | Full CRUD UI card |
| `client/src/pages/PropertyDetail.tsx` | Link chips between description and map |
| `client/src/components/portfolio/PortfolioPropertyCard.tsx` | Compact link chips (max 3, "+N" overflow) |

### API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/properties/:id/urls` | requireAuth | List all URLs for property |
| POST | `/api/properties/:id/urls` | requireManagementAccess | Add URL (http/https only, duplicate check) |
| PATCH | `/api/properties/:id/urls/:urlId` | requireManagementAccess | Update label/validity |
| DELETE | `/api/properties/:id/urls/:urlId` | requireManagementAccess | Remove URL |
| POST | `/api/properties/:id/urls/validate` | requireManagementAccess | Batch GET-request validation (15s timeout) |

### SSRF Protection
Validation endpoint blocks via hostname/IP pattern checks:
- Localhost variants (127.0.0.1, 0.0.0.0, ::1)
- RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x)
- Cloud metadata (169.254.169.254, metadata.google.internal)
- Internal TLDs (.local, .internal)
- Protocol restriction (http/https only)

### Status Badges
- **Unchecked** (gray) — Not yet validated
- **Valid** (muted) — GET request returned 2xx
- **Relevant** (primary) — Valid + AI/heuristic relevance score >= 0.6
- **Broken** (destructive) — GET request failed or non-2xx response

### Research Integration
Property URLs feed into the research engine via Pinecone vector indexing:
- After validation, relevant URLs (score >= 0.6) are upserted into Pinecone namespace `properties` with vector ID `prop-url:{propertyId}:{urlId}`
- Stale/invalid URLs are deleted from Pinecone during validation
- Research orchestrator (`server/ai/research-orchestrator.ts`) queries Pinecone for `prop-url:{propertyId}` chunks and appends them as "Property Reference URLs" in the research prompt
- Property `sourceUrls` array also included in property context pack narrative

---

## Stage 4: AI Image Enhancement

### Flow
1. User clicks Sparkles button on hero photo in `PhotoAlbumGrid`
2. `POST /api/property-photos/:id/enhance` sends photo to Replicate clarity-upscaler
3. Enhanced image stored in server memory (`pendingEnhancements` Map) — NOT in DB
4. `EnhancePreviewDialog` shows side-by-side/slider comparison
5. **Accept**: `POST /api/property-photos/:id/enhance/accept` commits to DB + regenerates variants via `processImage()`
6. **Reject**: `POST /api/property-photos/:id/enhance/reject` discards staged enhancement

### Key Files

| File | Purpose |
|------|---------|
| `server/routes/property-photos.ts` | All 6 enhancement endpoints with `checkPropertyAccess` |
| `server/image/pipeline.ts` | `processImage()` — generates size variants |
| `server/integrations/replicate.ts` | Replicate API client |
| `server/config/replicate-models.json` | Model configs (clarity-upscaler = photo-upscale) |
| `client/src/features/property-images/EnhancePreviewDialog.tsx` | Side-by-side + slider compare |
| `client/src/features/property-images/PhotoAlbumGrid.tsx` | Sparkles button, Enhanced badge |
| `client/src/lib/api/property-photos.ts` | `useEnhancePhoto`, `useAcceptEnhancement`, `useRejectEnhancement` |

### API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/property-photos/:id/enhance` | checkPropertyAccess | Send to Replicate, stage result |
| GET | `/api/property-photos/:id/enhanced-image` | checkPropertyAccess | Serve enhanced image binary |
| POST | `/api/property-photos/:id/enhance/accept` | checkPropertyAccess | Commit to DB + regenerate variants |
| POST | `/api/property-photos/:id/enhance/reject` | checkPropertyAccess | Discard staged enhancement |
| DELETE | `/api/property-photos/:id/enhanced` | checkPropertyAccess | Revert to original |
| GET | `/api/property-photos/:id/enhanced-preview` | requireAuth | Serve staged enhanced preview |

### Security
- All 6 endpoints enforce `checkPropertyAccess` (prevents IDOR)
- Enhancement staged in server memory, not DB, until explicit Accept
- Reject clears server memory entry

### Schema
`property_photos` table includes `enhancedImageData` (TEXT, base64) column added via migration `enhanced-photo-001.ts`.

---

## Stage 5: AI Description Rewrite

### Flow
1. User enters/edits description in `DescriptionSection`
2. Clicks "Improve with AI" button
3. `POST /api/properties/:id/rewrite-description` sends text to Gemini LLM
4. Preview dialog shows original vs improved text side-by-side
5. Accept replaces description; Dismiss keeps original

### Key Files

| File | Purpose |
|------|---------|
| `client/src/components/property-edit/DescriptionSection.tsx` | Read/edit mode, AI rewrite preview dialog |
| `server/routes/properties.ts` | `POST /api/properties/:id/rewrite-description` |
| `client/src/pages/PropertyDetail.tsx` | Full description card display |
| `client/src/components/portfolio/PortfolioPropertyCard.tsx` | Truncated description (60 words) |

### API Contract
- **Endpoint**: `POST /api/properties/:id/rewrite-description`
- **Auth**: `requireManagementAccess` + `checkPropertyAccess`
- **Body**: `{ text: string }` (1-5000 chars, Zod validated)
- **LLM**: Gemini via `resolveLlm("aiUtilityLlm")`
- **Response**: `{ rewritten: string }`

---

## Extension Patterns

### Adding a New Enrichment Stage

1. Define any new schema columns in `shared/schema/properties.ts`
2. Add storage methods in `server/storage/` with typed interface
3. Create API endpoints in `server/routes/properties.ts` with proper auth
4. Build UI component in `client/src/components/property-edit/`
5. Wire display into `PropertyDetail.tsx` and `PortfolioPropertyCard.tsx`
6. If the data feeds research, update the context pack builder
7. Add mutation hooks to `NON_FINANCIAL_MUTATIONS` or `FINANCIAL_MUTATIONS` in `tests/proof/recalculation-enforcement.test.ts`

### Auth Patterns
- **Read**: `requireAuth` (any authenticated user)
- **Write**: `requireManagementAccess` (admin/manager only)
- **Resource-scoped**: `checkPropertyAccess(req, propertyId)` for property-specific data
- **SSRF protection**: Required for any endpoint that makes outbound HTTP requests based on user input

### Display Patterns
- **PropertyDetail**: Full-width cards between header and financial sections
- **PortfolioPropertyCard**: Compact inline elements with overflow handling
- **Status badges**: Color-coded (primary/destructive/muted) with dot indicators
- **Icon buttons**: Circular hover targets with `stopPropagation` for cards

---

## Data Flow Summary

```
Property Created
  ↓
Address Autocomplete → Geocode → Auto-fill city/state/zip/country
  ↓                                    ↓
  ↓                              Lat/Lng persisted
  ↓                                    ↓
  ↓                           Map & 3D links appear
  ↓
URLs Added → Validated → Relevance scored
  ↓                         ↓
  ↓                   Status badges shown
  ↓                         ↓
  ↓                   Research sources enriched
  ↓
Photos Uploaded → AI Enhancement → Accept/Reject
  ↓                                      ↓
  ↓                              Variants regenerated
  ↓
Description Written → AI Rewrite → Accept/Dismiss
  ↓
Context Pack Built (all enriched data)
  ↓
Research Engine → Badges → Guidance → Financial Assumptions
```
