---
name: 3d-graphics
description: 3D graphics engine and animation system using Three.js and framer-motion. Use when adding 3D scenes, animations, visual effects, or modifying existing 3D components.
---

# 3D Graphics & Animation System

## Tech Stack
- **3D Engine**: Three.js via @react-three/fiber, @react-three/drei, @react-three/postprocessing
- **Animation**: framer-motion for entrance animations, transitions, and staggered reveals

## 3D Scene Components

| Component | File | Purpose |
|-----------|------|---------|
| Dashboard3DBackground | `client/src/components/Dashboard3DBackground.tsx` | Three.js spheres, rings, and particles behind the dashboard |
| Login3DScene | `client/src/components/Login3DScene.tsx` | Glowing orbs, orbital rings, floating dots, and stars on login |
| ResearchRefreshOverlay | `client/src/components/ResearchRefreshOverlay.tsx` | Auto-refresh 3D overlay during research regeneration |

## Animation Wrappers

File: `client/src/components/ui/animated.tsx`

| Wrapper | Effect |
|---------|--------|
| FadeIn | Opacity fade entrance |
| FadeInUp | Fade + slide up entrance |
| ScaleIn | Scale from small to full size |
| StaggerContainer | Staggers children animations |
| PageTransition | Full page transition wrapper |

## Usage Pattern
- 3D scenes are overlaid as background layers with `pointer-events-none`
- Animated wrappers enhance page content with entrance effects
- 3D components should not interfere with interactive UI elements
- Keep 3D scenes lightweight for performance (limit polygon count and particle systems)

## Adding a New 3D Scene
1. Create component in `client/src/components/`
2. Use `@react-three/fiber` Canvas with appropriate camera settings
3. Add `pointer-events-none` to prevent UI interference
4. Import drei helpers for common 3D primitives
5. Use postprocessing for visual effects (bloom, vignette)

## Adding Animations to a Page
1. Import wrappers from `@/components/ui/animated`
2. Wrap sections with `FadeIn`, `FadeInUp`, or `ScaleIn`
3. Use `StaggerContainer` for lists/grids
4. Use `PageTransition` at the page root
