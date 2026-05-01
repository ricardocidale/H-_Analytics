# Reusable UI Components

## Image & Media Components

### AIImagePicker (`client/src/components/ui/ai-image-picker.tsx`)
- Three modes: Upload, AI Generate, URL input
- Configurable: aspect ratio, variant (dark/light), max file size, default prompt
- Uses Nano Banana (gemini-2.5-flash-image) for AI generation via /api/generate-property-image
- Props: imageUrl, onImageChange, defaultPrompt, promptPlaceholder, uploadLabel, generateLabel, variant, aspectRatio, maxSizeMB, showUrlMode, context

### PropertyImagePicker (`client/src/features/property-images/PropertyImagePicker.tsx`)
- Wraps AIImagePicker with property-specific defaults
- Auto-generates prompt from property name + location
- Props: imageUrl, onImageChange, propertyName, location, variant

### AnimatedLogo (`client/src/components/ui/animated-logo.tsx`)
- SVG wrapper for raster images enabling vector-like scaling and animation
- Animation modes: none, pulse, glow, spin, bounce
- Props: src, alt, size, animation, className, rounded

### ImagePreviewCard (`client/src/components/ui/image-preview-card.tsx`)
- Card displaying image with overlay title/subtitle and hover action buttons
- Props: src, alt, title, subtitle, onEdit, onDelete, badge, aspectRatio

## Status & Indicators

### StatusBadge (`client/src/components/ui/status-badge.tsx`)
- Colored dot + label for status display
- Statuses: active, inactive, pending, error, warning
- Props: status, label, size, pulse

### HelpTooltip (`client/src/components/ui/help-tooltip.tsx`)
- HelpCircle icon with hover tooltip text
- Used extensively in financial tables for line item explanations
- Controlled by CalcDetailsContext (showDetails toggle)
- Props: text, light, side, manualSection, manualLabel

### InfoTooltip (`client/src/components/ui/info-tooltip.tsx`)
- Info icon variant with optional formula display and manual links
- Props: text, formula, light, side, manualSection, manualLabel

### ChartModeToggle (`client/src/components/dashboard/OverviewTab.tsx`)
- Segmented control for switching between Area and Line chart modes
- Props: mode ("area" | "line"), onChange

## Card & Layout Components

### EntityCardContainer / EntityCardItem / EntityEmptyState (`client/src/components/ui/entity-card.tsx`)
- Reusable entity card system for admin grids
- Container: icon, title, description, onAdd button
- Item: logo, name, badge, description, metadata, members, edit/delete buttons
- EmptyState: icon + title + subtitle for empty lists

## Hooks

### useUpload (`client/src/hooks/use-upload.ts`)
- Presigned URL upload flow (request URL → upload to URL)
- Returns: uploadFile, getUploadParameters, isUploading, error, progress

### useGenerateImage (`client/src/features/property-images/useGenerateImage.ts`)
- AI image generation hook calling /api/generate-property-image
- Returns: generateImage, isGenerating, error
