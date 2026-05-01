---
name: Auto Refresh
description: Automatically refreshes stale market research data when a user logs in, with an engaging 3D animated progress overlay to keep users informed while ...
---

# Auto-Refresh Market Research on Login

## Purpose
Automatically refreshes stale market research data when a user logs in, with an engaging 3D animated progress overlay to keep users informed while data is being updated.

## Behavior

### Trigger
- Fires once per browser session after successful login
- Uses `sessionStorage.setItem('research_refresh_done', Date.now().toString())` to prevent re-triggering on navigation
- Clears on browser tab close (session storage behavior)

### Age-Gating
- Before refreshing, checks each property's research data age via `GET /api/market-research/:type/:entityId`
- Only regenerates research older than **7 days** (`RESEARCH_MAX_AGE_DAYS = 7`)
- Properties with fresh research are skipped, saving API calls and time

### Refresh Flow
1. User logs in → `App.tsx` detects authenticated state + no session flag
2. `ResearchRefreshOverlay` mounts and fetches property list
3. For each property, checks research freshness
4. Stale properties trigger `POST /api/market-research/property/:id/generate`
5. Progress overlay shows current property name and completion percentage
6. On completion, overlay fades out and session flag is set

## 3D Animated Overlay

### Component
`client/src/components/ResearchRefreshOverlay.tsx`

### Technology
- **Three.js** via `@react-three/fiber` (React renderer)
- **@react-three/drei** (helpers: Float, MeshDistortMaterial)
- **framer-motion** (fade-in/fade-out transitions)

### Visual Elements
| Element | Description |
|---------|-------------|
| `GlowingSphere` | Central pulsing sphere with distort material, represents the AI "brain" processing |
| `DataOrb` | Small orbiting spheres that appear as each property completes, floating upward |
| `WobbleRing` | Rotating torus ring around the central sphere, indicates active processing |
| Progress Text | Current property name + percentage, overlaid on the 3D scene |
| Background | Semi-transparent dark overlay (`bg-black/80`) with blur backdrop |

### Performance
- Uses `<Canvas>` with `dpr={[1, 1.5]}` for performance on lower-end devices
- Post-processing effects (bloom) disabled by default for stability
- Scene elements use `useFrame` for smooth 60fps animation

## Integration in App.tsx

```tsx
import { ResearchRefreshOverlay } from "@/components/ResearchRefreshOverlay";

function App() {
  const { isAuthenticated } = useAuth();
  const [showRefresh, setShowRefresh] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !sessionStorage.getItem('research_refresh_done')) {
      setShowRefresh(true);
    }
  }, [isAuthenticated]);

  const handleResearchComplete = useCallback(() => {
    sessionStorage.setItem('research_refresh_done', Date.now().toString());
    setShowRefresh(false);
  }, []);

  return (
    <>
      <Router>...</Router>
      {showRefresh && <ResearchRefreshOverlay onComplete={handleResearchComplete} />}
    </>
  );
}
```

## Dependencies
- `three` — Core 3D engine
- `@react-three/fiber` — React renderer for Three.js
- `@react-three/drei` — Helper components (Float, MeshDistortMaterial)
- `framer-motion` — Animation library for overlay transitions
- `@react-three/postprocessing` — Optional bloom/glow effects

## API Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/properties` | GET | Fetch list of properties to check |
| `/api/market-research/property/:id` | GET | Check research data age |
| `/api/market-research/property/:id/generate` | POST | Regenerate stale research |
