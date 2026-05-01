---
name: data-source-cards
description: Card-based data source management pattern for H+ Analytics — card report-card design, CRUD flow, toggle/test/logs actions, health badge thresholds, dependability rules, category tabs, and how to add new source types. Use when building, modifying, or extending the data source management system.
---

# Data Source Cards System

## Purpose & Scope

The Data Sources page in the H+ Analytics admin panel manages external data providers using a card-based "report card" UI pattern. Each data source is represented as a card showing its health status, metrics, configuration, and available actions. Sources are organized into category tabs (APIs, Scrapers, Sources, Models).

---

## Architecture

### File Map

| Component | File | Purpose |
|-----------|------|---------|
| `DataSourcesTab` | `client/src/components/admin/intelligence/DataSourcesTab.tsx` | Main tab with category tabs, card grid, CRUD dialogs |
| `DataSourceCard` | Same file (inline) | Individual source card component |
| `ConfigureDialog` | Same file (inline) | Create/edit source dialog |
| `LogsPanel` | Same file (inline) | Activity log side sheet |
| `StatusBadge` | Same file (inline) | Health status badge |
| `HealthBadge` | Same file (inline) | Warning/error badge overlay |

### Schema

```typescript
// source_registry table
interface SourceEntry {
  id: number;
  serviceKey: string;        // Unique identifier (e.g., "fred-api")
  name: string;              // Display name (e.g., "FRED API")
  sourceType: string;        // Type within category (e.g., "api", "scraper", "llm")
  trustScore: string | null; // Quality rating
  category: string;          // Category tab: "apis" | "scrapers" | "sources" | "models"
  cadence: string | null;    // Update frequency: "realtime" | "hourly" | "daily" | etc.
  lastHealthCheck: string | null;
  lastDataDate: string | null;
  isActive: boolean;         // Toggle on/off
  description: string | null;
  endpoint: string | null;   // API endpoint URL
  apiKeyRef: string | null;  // Environment variable name for credentials
  rateLimitPerMin: number | null;
  successRate: number | null; // 0-100 percentage
  avgLatencyMs: number | null;
  costPerCall: string | null; // Display string (e.g., "$0.01", "Free")
  dataProvided: string[] | null; // Tags (e.g., ["SOFR", "CPI", "Treasury Yields"])
}

// source_call_logs table
interface CallLogEntry {
  id: number;
  sourceId: number;          // FK to source_registry
  serviceKey: string;
  timestamp: string;
  httpStatus: number | null;
  latencyMs: number | null;
  success: boolean;
  errorMessage: string | null;
}
```

---

## API Contract

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/admin/source-registry` | List all sources |
| `POST` | `/api/admin/source-registry` | Create new source |
| `PATCH` | `/api/admin/source-registry/:id` | Update source config |
| `PATCH` | `/api/admin/source-registry/:id/toggle` | Toggle active/inactive |
| `DELETE` | `/api/admin/source-registry/:id` | Delete source (cascades logs) |
| `POST` | `/api/admin/source-registry/:id/test` | Test connectivity (logs result) |
| `GET` | `/api/admin/source-registry/:id/logs` | Last 50 call log entries |

All endpoints require admin authentication (`requireAdmin` middleware).

### SSRF Protection

The test endpoint includes full SSRF protection:
- RFC1918 CIDR blocking (10.0.0.0/8, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x)
- IPv6 private ranges (fc/fd/fe80)
- Cloud metadata IPs (169.254.169.254, metadata.google.internal)
- .local/.internal TLD blocking
- DNS resolution guard (resolve hostname → check resolved IPs)

---

## Card Report-Card Design

### Card Anatomy

```
┌─────────────────────────────────────┐
│  Name ·  StatusBadge  HealthBadge   │ [Toggle Switch]
│  Description / source type          │
├─────────────────────────────────────┤
│  Last Check: 2m ago    Success: 98% │  (2×2 metric grid)
│  Avg Latency: 142ms    Cost: $0.01  │
├─────────────────────────────────────┤
│  [SOFR] [CPI] [Treasury Yields]    │  (data provided tags)
├─────────────────────────────────────┤
│  [Test Result: Connected — 87ms]    │  (inline test feedback)
├─────────────────────────────────────┤
│  Configure  Test  Logs         🗑️   │  (action bar)
└─────────────────────────────────────┘
```

### Health Status Badges

| Status | Condition | Badge Color | Label |
|--------|-----------|-------------|-------|
| Healthy | Active + successRate ≥ 90% | Emerald | "Healthy" |
| Degraded | Active + successRate 80–89% | Amber | "Degraded" |
| Unreliable | Active + successRate < 80% | Red | "Unreliable" |
| Inactive | isActive = false | Gray | "Inactive" |

### Health Badge (Warning Overlay)

| Condition | Badge | Color |
|-----------|-------|-------|
| successRate < 80% | "Unreliable" with AlertTriangle | Red |
| successRate 80–89% | "Warning" with AlertTriangle | Amber |
| successRate ≥ 90% | Hidden | — |

---

## Category Tabs

| Tab | Category Value | Icon | Source Types |
|-----|---------------|------|-------------|
| APIs | `apis` | `IconGlobe` | api, rest, graphql |
| Scrapers | `scrapers` | `IconResearch` | scraper, crawler, extractor |
| Sources | `sources` | `IconActivity` | report, survey, publication, database |
| Models | `models` | `IconBrain` | llm, embedding, vision |

Each tab filters the card grid to show only sources matching that category.

---

## CRUD Flow

### Create

1. Click "Add {Category}" button in tab header
2. `ConfigureDialog` opens in create mode
3. Fill fields: name, serviceKey (auto-generated from name), description, endpoint, apiKeyRef, rateLimitPerMin, costPerCall, cadence, dataProvided
4. Submit → `POST /api/admin/source-registry`
5. Invalidate query cache → card appears in grid

### Read

- `GET /api/admin/source-registry` → `useQuery` with key `["/api/admin/source-registry"]`
- Cards filtered by `activeCategory` tab selection

### Update

1. Click "Configure" on card action bar
2. `ConfigureDialog` opens in edit mode with pre-filled values
3. Edit fields → `PATCH /api/admin/source-registry/:id`
4. Invalidate cache → card updates

### Delete

1. Click trash icon on card
2. `AlertDialog` confirmation: "This will permanently remove the source and all its activity logs."
3. Confirm → `DELETE /api/admin/source-registry/:id`
4. Cascade deletes all `source_call_logs` for that source
5. Invalidate cache → card removed

---

## Toggle / Test / Logs Actions

### Toggle

```typescript
PATCH /api/admin/source-registry/:id/toggle
Body: { isActive: boolean }
```
- Switch component on card header
- Inactive cards render at 60% opacity
- Inactive cards hide metrics grid and test results

### Test

```typescript
POST /api/admin/source-registry/:id/test
Response: { healthy: boolean, latencyMs: number, error?: string }
```
- Creates a `source_call_logs` entry with the result
- Updates `lastHealthCheck`, `successRate`, `avgLatencyMs` on the source
- Shows inline test result on the card (green "Connected — 87ms" or red "Failed — error")
- Button shows "Testing…" during request

### Logs

- Opens a `Sheet` side panel showing last 50 call log entries
- Each entry shows: status dot (green=success, amber=429, red=error), HTTP status code, latency, error message, timestamp
- Empty state: "No activity logged yet. Use the 'Test' button to create an entry."

---

## Dependability Rules

1. **Never silently fail** — All test/toggle/CRUD errors surface as destructive toasts
2. **Cascading deletes** — Deleting a source removes all its call logs
3. **Credential safety** — `apiKeyRef` stores the env var NAME, never the actual secret
4. **SSRF guard** — Test endpoint validates URLs against private IP ranges before fetching
5. **Rate limit awareness** — `rateLimitPerMin` is stored but not enforced by the card system (enforcement is in the research pipeline)

---

## Adding a New Source Type

1. Add the source type string to the appropriate `SOURCE_TYPES` array in `DataSourcesTab.tsx`
2. If adding a new category tab, add to `CATEGORY_TABS` and `CATEGORY_SINGULAR` constants
3. Seed the source via `POST /api/admin/source-registry` or direct SQL insert
4. The card grid auto-discovers new sources via the query

### Example: Adding a "webhook" source type to APIs

```typescript
const SOURCE_TYPES: Record<SourceCategory, string[]> = {
  apis: ["api", "rest", "graphql", "webhook"],  // Add here
  ...
};
```

---

## Testing

| Element | Test ID |
|---------|---------|
| Card | `data-source-card-{serviceKey}` |
| Toggle | `toggle-{serviceKey}` |
| Configure button | `configure-{serviceKey}` |
| Test button | `test-{serviceKey}` |
| Logs button | `logs-{serviceKey}` |
| Delete button | `delete-{serviceKey}` |
| Test result | `test-result-{serviceKey}` |
| Configure dialog | `configure-dialog` |
| Logs panel | `logs-panel` |

---

## Portability Notes

This card-based source management pattern is reusable:
- **Card anatomy** applies to any resource with health metrics (microservices, integrations, connectors)
- **Category tabs** pattern works for any multi-type resource registry
- **Test/Logs pattern** applies to any service with connectivity checking needs
- **Health badge thresholds** (90%/80%) are configurable — adjust for domain requirements
- **SSRF protection** implementation should be extracted to a shared utility for reuse
