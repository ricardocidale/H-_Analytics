# Property Image Picker

## Overview

The `PropertyImagePicker` component provides a property-specific interface for setting a property's photo. It is a thin wrapper around the generic `AIImagePicker` component, adding auto-prompt generation from property context (name + location) and property-appropriate defaults.

## Architecture

```
PropertyImagePicker (feature wrapper)
  └── AIImagePicker (reusable UI component)
        ├── Upload mode — dropzone with presigned URL flow
        ├── AI Generate mode — prompt → Nano Banana / OpenAI fallback
        └── URL mode — paste any image URL
```

`PropertyImagePicker` lives in the features layer and delegates all rendering and interaction logic to `AIImagePicker`. It passes a `defaultPrompt` built from the property name and location, and forwards `variant` and image state props.

## AIImagePicker — Canonical Reusable Component

**File**: `client/src/components/ui/ai-image-picker.tsx`

The generic, reusable image picker used across the app. Supports three input modes and is fully configurable via props.

### Modes

1. **Upload** — Click-to-upload dropzone with file validation (image types only, configurable max size). Uses the `useUpload` hook with presigned URL flow.
2. **AI Generate** — Text prompt input with generate button. Calls the `useGenerateImage` hook. Supports a default prompt that auto-fills when the field is empty.
3. **URL** — Paste any image URL directly. Toggled via the `showUrlMode` prop.

All three modes show an image preview with a remove button once an image is set.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `imageUrl` | `string` | required | Current image URL (empty string if none) |
| `onImageChange` | `(url: string) => void` | required | Called when image is set or removed |
| `defaultPrompt` | `string` | `""` | Pre-filled prompt for AI generation |
| `promptPlaceholder` | `string` | — | Placeholder text for the prompt input |
| `uploadLabel` | `string` | — | Label shown on the upload dropzone |
| `generateLabel` | `string` | — | Label for the generate button |
| `variant` | `"dark" \| "light"` | `"dark"` | Visual theme — `"dark"` for dialogs, `"light"` for pages |
| `aspectRatio` | `"square" \| "landscape" \| "portrait"` | `"landscape"` | Shape of the image preview area |
| `maxSizeMB` | `number` | `10` | Maximum upload file size in MB |
| `showUrlMode` | `boolean` | `false` | Whether to show the URL input tab |
| `context` | `string` | — | Contextual hint passed to the AI generation prompt |

## PropertyImagePicker — Feature Wrapper

**File**: `client/src/features/property-images/PropertyImagePicker.tsx`

Wraps `AIImagePicker` with property-specific defaults: auto-generates a prompt from property name and location, and exposes a simpler prop surface.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `imageUrl` | `string` | required | Current image URL (empty string if none) |
| `onImageChange` | `(url: string) => void` | required | Called when image is set or removed |
| `propertyName` | `string` | optional | Used to auto-generate the AI prompt |
| `location` | `string` | optional | Used to auto-generate the AI prompt |
| `variant` | `"dark" \| "light"` | `"dark"` | Visual theme — `"dark"` for dialogs, `"light"` for pages |

### Usage

```tsx
import { PropertyImagePicker } from "@/features/property-images";

// In a create dialog (dark variant is default)
<PropertyImagePicker
  imageUrl={formData.imageUrl}
  onImageChange={(url) => setFormData(prev => ({ ...prev, imageUrl: url }))}
  propertyName={formData.name}
  location={formData.location}
/>

// In an edit page (light variant for assumption pages)
<PropertyImagePicker
  imageUrl={draft.imageUrl}
  onImageChange={(url) => handleChange("imageUrl", url)}
  propertyName={draft.name}
  location={draft.location}
  variant="light"
/>
```

### Auto-Prompt Generation

When the user leaves the prompt field empty and clicks Generate, the component builds a prompt from the property name and location:

```
"Luxury boutique hotel exterior, [property name], [location], architectural photography, golden hour lighting"
```

If neither property name nor location is provided, the user must enter a prompt manually.

## Hook: `useGenerateImage`

**File**: `client/src/features/property-images/useGenerateImage.ts`

Calls `POST /api/generate-property-image`, which generates an image server-side and uploads it to object storage in one step.

```typescript
const { generateImage, isGenerating, error } = useGenerateImage({
  onSuccess: (objectPath: string) => { /* e.g. "/objects/uploads/uuid" */ },
  onError: (error: Error) => { /* handle error */ },
});

const path = await generateImage("Luxury boutique hotel exterior, golden hour");
```

## Server Endpoint

**`POST /api/generate-property-image`** (auth required)

Request:
```json
{ "prompt": "Luxury boutique hotel exterior, Upstate New York" }
```

Response:
```json
{ "objectPath": "/objects/uploads/abc-123-uuid" }
```

### Image Generation Pipeline

**Client file**: `server/replit_integrations/image/client.ts`

The server uses a two-tier model strategy:

1. **Primary — Nano Banana (`gemini-2.5-flash-image`)**: Calls `generateContent()` with `responseModalities: ["image", "text"]` to produce an inline image.
2. **Fallback — OpenAI (`gpt-image-1`)**: If Nano Banana fails or is unavailable, the server falls back to OpenAI image generation.

The resulting PNG buffer is uploaded to object storage via presigned URL, and the object path is returned to the client.

## Integration Points

| Context | File | Component | Variant |
|---------|------|-----------|---------|
| Portfolio (create dialog) | `client/src/pages/Portfolio.tsx` | `PropertyImagePicker` | `"dark"` (default) |
| Property Edit | `client/src/pages/PropertyEdit.tsx` | `PropertyImagePicker` | `"light"` |
| Admin Logos tab | `client/src/pages/Logos.tsx` | `AIImagePicker` | — |
