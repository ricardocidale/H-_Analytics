---
name: map-view
description: MapLibre GL interactive portfolio map with Supercluster property clustering. Covers coordinate resolution, cluster rendering, property popups, and globe animation. Load when working on the map page or geospatial features.
---

# Map View

## Purpose

Documents the interactive globe/map view that visualizes portfolio properties geographically using MapLibre GL JS with Supercluster for marker clustering.

## Key Files

| File | Purpose |
|------|---------|
| `client/src/pages/MapView.tsx` | Full map page — MapLibre GL, Supercluster, popups, globe animation |

## Architecture

```
useProperties() → properties[]
  ↓
resolveCoords(property) → [lng, lat] | null
  ↓
Supercluster.load(geoJSONPoints)
  ↓
MapLibre GL JS render:
  ├── Cluster markers (circle with count)
  ├── Individual property markers (icon)
  └── Click → popup with property details
  ↓
Globe animation (auto-rotate, pause on interaction)
```

## Coordinate Resolution (3-tier fallback)

Properties are placed on the map using a priority chain:

| Priority | Source | When Used |
|----------|--------|-----------|
| 1 | `property.latitude` / `property.longitude` | Explicit coordinates in DB |
| 2 | `KNOWN_COORDS` lookup | City+state+country string match (hardcoded known locations) |
| 3 | `REGION_COORDS` + hash offset | Country-level with deterministic offset to avoid overlap |

If all three fail, the property is excluded from the map.

### Known Coordinates

`KNOWN_COORDS` maps lowercase `"city, state, country"` strings to `[lng, lat]` tuples for portfolio properties with known exact locations.

### Region Fallback

`REGION_COORDS` maps country names to approximate center points. When used, a hash-based offset is applied so multiple properties in the same country don't stack.

## Supercluster Configuration

Supercluster groups nearby properties into clusters at lower zoom levels:
- Cluster markers show property count
- Clicking a cluster zooms to expand it
- At max zoom, individual property markers appear

## Property Popups

Clicking an individual marker opens a popup with:
- Property name and location
- Key financial metrics (purchase price, ADR, etc.)
- Link to property detail page

## Globe Animation

The map starts in globe projection with auto-rotation:
- Play/pause toggle button
- Rotation pauses on user interaction (drag, zoom)
- Resumes after idle timeout

## Dependencies

- `maplibre-gl` — Map rendering engine (free, no API key required)
- `supercluster` — Fast geospatial point clustering
- `maplibre-gl/dist/maplibre-gl.css` — Required stylesheet

## Related Skills

- `.claude/skills/design-system/SKILL.md` — Consistent styling for map UI elements
