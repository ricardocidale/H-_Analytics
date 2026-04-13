---
name: Property Finder
description: The Property Finder enables users to search for real estate listings on the external market, save favorites, and manage saved searches. It integrat...
---

# Property Finder Skill

## Overview

The Property Finder enables users to search for real estate listings on the external market, save favorites, and manage saved searches. It integrates with the RapidAPI "Realty in US" service to pull live property data and constructs validated listing URLs for realtor.com.

## Architecture

```
Client                          Server                           External
─────────────────────         ─────────────────────            ──────────────────
PropertyFinder.tsx       →    GET  /api/property-finder/search  → RapidAPI (Realty in US)
  ├─ Search tab          →    GET  /api/property-finder/favorites
  ├─ Saved Searches tab  →    GET  /api/property-finder/saved-searches
  └─ Saved Properties    →    POST/DELETE /api/property-finder/favorites
                               POST/DELETE /api/property-finder/saved-searches
                               PATCH /api/property-finder/favorites/:id/notes
```

## Data Model

### prospective_properties (Saved/Favorited Properties)

| Column | Type | Description |
|--------|------|-------------|
| id | integer (PK) | Auto-generated identity |
| userId | integer (FK → users) | Owner |
| externalId | text | RapidAPI property_id |
| source | text | Always "realty-in-us" |
| address | text | Full address string |
| city | text | City name |
| state | text | Two-letter state code |
| zipCode | text | Postal code |
| price | real | Listing price |
| beds | integer | Bedroom count |
| baths | real | Bathroom count |
| sqft | real | Square footage |
| lotSizeAcres | real | Lot size in acres |
| propertyType | text | e.g., "single_family" |
| imageUrl | text | Primary photo URL |
| listingUrl | text | Validated realtor.com permalink |
| notes | text | User notes |
| rawData | jsonb | Full API response for reference |
| savedAt | timestamp | When favorited |

**Unique constraint**: (userId, externalId, source) — prevents duplicate favorites.

### saved_searches

| Column | Type | Description |
|--------|------|-------------|
| id | integer (PK) | Auto-generated identity |
| userId | integer (FK → users) | Owner |
| name | text | User-given search name |
| location | text | City, ST or ZIP |
| priceMin | text | Minimum price filter |
| priceMax | text | Maximum price filter |
| bedsMin | text | Minimum bedrooms filter |
| lotSizeMin | text | Minimum lot size (acres) |
| propertyType | text | Property type filter |
| savedAt | timestamp | When saved |

## API Routes

All routes require authentication (`requireAuth`).

### Search

`GET /api/property-finder/search`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| location | string | Yes | City, ST or ZIP code |
| priceMin | string | No | Min list price |
| priceMax | string | No | Max list price |
| bedsMin | string | No | Minimum bedrooms |
| lotSizeMin | string | No | Minimum lot size (acres) |
| propertyType | string | No | Property type filter ("any" = no filter) |
| offset | string | No | Pagination offset (default 0) |

Rate limited: 30 requests per minute per user.

**Response**: `{ results: NormalizedProperty[], total: number, offset: number }`

### Favorites (Saved Properties)

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/property-finder/favorites | List user's saved properties |
| POST | /api/property-finder/favorites | Save a property |
| DELETE | /api/property-finder/favorites/:id | Remove a saved property |
| PATCH | /api/property-finder/favorites/:id/notes | Update notes on a saved property |

### Saved Searches

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/property-finder/saved-searches | List user's saved searches |
| POST | /api/property-finder/saved-searches | Save a search |
| DELETE | /api/property-finder/saved-searches/:id | Delete a saved search |

## URL Validation Strategy

Realtor.com blocks server-side HEAD requests with 403 (bot detection). Instead of validating URLs by hitting the target site, we use **format-based validation**:

### URL Construction (Search Results)

1. **Primary**: Use `r.href` or `r.permalink` from the API response. If it matches `/realestateandhomes-detail/`, prepend `https://www.realtor.com`.
2. **Fallback**: Construct from address components + property_id:
   ```
   https://www.realtor.com/realestateandhomes-detail/{line}_{city}_{state}_{zip}_{property_id}
   ```
   Address components: spaces → hyphens, non-alphanumeric stripped, joined with underscores.

### URL Validation (Favorites)

Stored URLs are validated against the regex pattern:
```
/^https:\/\/www\.realtor\.com\/realestateandhomes-detail\//
```
Invalid URLs are nulled out at read time (not mutated in DB).

### Realtor.com URL Format

```
https://www.realtor.com/realestateandhomes-detail/{Address}_{City}_{State}_{ZIP}_{PropertyID}
```

- Address: Street address with spaces as hyphens (e.g., `149-3rd-Ave`)
- City: City with spaces as hyphens (e.g., `San-Francisco`)
- State: Two-letter code (e.g., `CA`)
- ZIP: Postal code (e.g., `94118`)
- PropertyID: Usually starts with `M` followed by digits and hyphen (e.g., `M16017-14990`)

## External API Integration

### RapidAPI "Realty in US"

- **Endpoint**: `https://realty-in-us.p.rapidapi.com/properties/v3/list`
- **Method**: POST
- **Auth**: `X-RapidAPI-Key` header (stored as `RAPIDAPI_KEY` secret)
- **Request**: JSON body with location, filters, pagination
- **Response**: `data.home_search.results[]` array with property details

### Location Parsing

- ZIP code (5 digits): `payload.postal_code = location`
- City, State: Split on comma → `payload.city` + `payload.state_code`
- City only: `payload.city = location`

### Lot Size Conversion

- Input: acres (user-facing)
- API: square feet
- Conversion: `acres × 43,560 = sqft`

## Client Page

**File**: `client/src/pages/PropertyFinder.tsx`

Three tabs:
1. **Search** — Location input, filter controls, results grid with save/favorite buttons
2. **Saved Searches** — List of saved search configurations, re-run capability
3. **Saved Properties** — Grid of favorited properties with notes, delete, and listing link

Display uses the dark glass table theme consistent with the rest of the application.

## Tools

Co-located tool schemas in `tools/`:

| Tool | File | Purpose |
|------|------|---------|
| validate_listing_url | tools/validate-listing-url.json | Validate and construct realtor.com URLs |
| search_properties | tools/search-properties.json | Search external property listings |
| manage_favorites | tools/manage-favorites.json | Save, remove, and annotate favorite properties |

## Dependencies

- **Secret**: `RAPIDAPI_KEY` — Required for search functionality. Without it, search returns a helpful error message directing users to add the key.
- **Database**: `prospective_properties` and `saved_searches` tables via Drizzle ORM.
- **Storage interface**: `getProspectiveProperties()`, `addProspectiveProperty()`, `deleteProspectiveProperty()`, `updateProspectivePropertyNotes()`, `getSavedSearches()`, `addSavedSearch()`, `deleteSavedSearch()`.
