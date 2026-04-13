---
name: property-photos
description: Property photo management and rendering for HBG Portal. Covers photo data model, hero image selection, AI enhancement pipeline, and image display components. Use when adding, editing, or seeding property photos.
---

Property photo management and rendering requirements for HBG Portal. Use when adding, editing, or seeding property photos, or when working with image display components.

## Photo Data Model

Each property photo is stored in the `property_photos` table with:
- `imageUrl` (string) — source URL for the image (local path like `/images/...` or external URL like `https://uc.orez.io/...`)
- `caption` (string) — descriptive alt text for accessibility and display
- `sortOrder` (number) — display position (0-based)
- `isHero` (boolean) — whether this is the hero/primary image for the property
- `variants` (JSON, optional) — processed image variants (thumb, medium) in WebP/AVIF format

## Rendering Requirements

### PhotoCard Component (`client/src/features/property-images/PhotoCard.tsx`)
- Images rendered in `<picture>` element with progressive enhancement (AVIF → WebP → original)
- Aspect ratio: **4:3** (`aspect-[4/3]`) with `object-cover`
- Falls back to `photo.imageUrl` if no processed variants exist
- Hero image gets gold ring highlight (`ring-2 ring-accent-pop/60`)

### Image Sources
- **Local images**: stored in `public/images/` directory, referenced as `/images/filename.png`
- **External URLs**: direct hotlinks to CDN-hosted images (e.g., OwnerRez `uc.orez.io`)
- **Uploaded images**: processed through Sharp pipeline into WebP/AVIF variants

### External Image URL Formats (OwnerRez)
When using photos from OwnerRez-powered listings:
- Full-size: `https://uc.orez.io/i/{id}-LargeOriginal`
- Medium: `https://uc.orez.io/i/{id}-MediumOriginal`
- File-based: `https://uc.orez.io/f/{id}`
- Both formats work as direct `<img src>` without CORS issues

## Seed Photo Conventions (`server/seeds/photos.ts`)

### Structure
```typescript
const PROPERTY_PHOTOS: Record<string, PhotoSeed[]> = {
  "Property Name": [
    { imageUrl: "...", caption: "...", sortOrder: 0, isHero: true },
    { imageUrl: "...", caption: "...", sortOrder: 1, isHero: false },
  ],
};
```

### Photo Selection Guidelines
When curating photos for a property seed:
1. **Lead with building exteriors** — first 4-6 photos should show the building/structure from multiple angles and seasons
2. **Include the front entry** — clear approach/entrance shot for wayfinding
3. **Show key interior spaces** — great room, kitchen, primary bedroom (3-4 photos)
4. **Feature premium amenities** — hot tub, sauna, gym, pool, courts (3-4 photos)
5. **End with views/atmosphere** — landscape, seasonal, dusk/dawn shots (2-3 photos)
6. **Target 12-15 photos total** — enough for a rich gallery without bloat
7. **Hero image** = best overall exterior shot showing the full building
8. **Match seed financials to model** — e.g., Lodge properties should have modest F&B (~10%) but no Events revenue

### Caption Best Practices
- Use the property listing's alt text as captions when available
- Keep captions concise (under 100 characters)
- Describe what's visible, not marketing superlatives
- Include room/area name when showing interiors (e.g., "Primary bedroom with lake views")

## Hero Image Sync
The property's `imageUrl` field (used on portfolio cards, dashboards) should match the hero photo's URL. When updating seed photos, always update both `server/seeds/photos.ts` and `server/seeds/properties.ts`.

## Key Files
| File | Purpose |
|------|---------|
| `client/src/features/property-images/PhotoCard.tsx` | Individual photo card with hero star, drag handle, caption editing |
| `client/src/features/property-images/PhotoAlbumGrid.tsx` | Drag-sortable photo grid |
| `client/src/features/property-images/PhotoUploadDialog.tsx` | Upload dialog with URL/file support |
| `client/src/features/property-images/PhotoGenerateDialog.tsx` | AI image generation dialog |
| `client/src/features/property-images/ImageCropDialog.tsx` | Client-side image cropping |
| `client/src/pages/PropertyPhotos.tsx` | Full property photo management page |
| `server/seeds/photos.ts` | Seed photo data keyed by property name |
| `server/storage/photos.ts` | Photo CRUD storage layer |
| `server/routes/property-photos.ts` | Photo API routes |
| `server/image/pipeline.ts` | Sharp-based image processing pipeline |
