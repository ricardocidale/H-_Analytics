---
name: admin-configurator
description: Admin panel architecture and patterns for H+ Analytics. Covers the 5-group sidebar structure (Business, Intelligence Engine, AI Assistant, Design, System), section redirect system, merged pages (Brand, Pipeline Config), Engine Dashboard anatomy, standard tab component pattern, settings card layout, and the API fetch/save flow. Use this skill when adding a new admin tab, modifying admin settings UI, or building admin configuration panels.
---

# Admin Panel Architecture

## Admin Panel Structure

The Admin page (`client/src/pages/Admin.tsx`) renders a sidebar (`AdminSidebar.tsx`) + content area. Each sidebar item maps to a section component.

### 5-Group Sidebar Structure

| Group | Icon | Description | Sections |
|-------|------|-------------|----------|
| **Business** | `IconBriefcase` | Users, companies & groups | Users, Companies, Groups, Scenarios |
| **Intelligence Engine** | `IconGauge` | Research & data management | Engine Dashboard, Data Sources, Pipeline Config, QA Sandbox, Scheduled Research, Financial Lines |
| **AI Assistant** | `IconBot` | Rebecca configuration & training | Configuration, Knowledge Base, Conversations |
| **Design** | `IconSwatchBook` | Brand & exports | Brand, Exports |
| **System** | `IconShield` | Infrastructure & monitoring | App Defaults, Verification, Database, Notifications, Navigation |

**Additional standalone items** (below groups, separated by border):
- **Logs** → Activity (admin activity log)
- **Help** → Link to `/help` (user manual)

### Section Redirect System

Legacy section IDs are automatically redirected to their new consolidated pages:

```typescript
const SECTION_REDIRECTS: Partial<Record<AdminSection, AdminSection>> = {
  "icp": "engine-dashboard",
  "logos": "brand",
  "themes": "brand",
  "icons": "brand",
  "llms": "data-sources",
  "model-routing": "pipeline-config",
  "cache-services": "engine-dashboard",
  "integrations": "data-sources",
  "api-dashboard": "data-sources",
  "coverage-analytics": "engine-dashboard",
  "pipeline-policies": "pipeline-config",
  "source-registry": "data-sources",
  "system-intelligence": "engine-dashboard",
  "research": "engine-dashboard",
  "sources": "data-sources",
};
```

Use `resolveSection(section)` to resolve any section ID to its canonical target.

### Merged Pages

Several previously separate pages have been consolidated:

| Merged Page | Replaces | Content |
|-------------|----------|---------|
| **Brand** | Logos + Themes + Icons | All visual identity settings in one page |
| **Pipeline Config** | Model Routing + Pipeline Policies | LLM config + research pipeline settings |
| **Engine Dashboard** | ICP + Coverage Analytics + System Intelligence + Cache & Services | Unified intelligence observatory |
| **Data Sources** | Source Registry + Integrations + API Dashboard + LLMs | Card-based source management |

---

## Engine Dashboard Anatomy

The Engine Dashboard (`EngineDashboard.tsx`) is the centralized intelligence observatory:

| Section | Content |
|---------|---------|
| **Intelligence Health** | Portfolio freshness counts (current/stale/missing/running), auto-refresh status |
| **Portfolio Profile** | Auto-derived from property assumptions — star rating distribution, business model mix, market coverage |
| **Coverage Analytics** | Which assumption fields have research vs gaps |
| **Research Activity** | Recent research runs, success rates, average duration |

---

## Standard Tab Component Pattern

Every admin tab follows the same structure:

```tsx
export default function MyConfigTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<MyConfig>(DEFAULT_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfigFromApi()
      .then((cfg) => setConfig(cfg))
      .catch(() => toast({ title: "Could not load", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await putConfigToApi(config);
      setConfig(saved);
      setDirty(false);
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Settings content */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" onClick={handleReset} disabled={saving}>Reset to defaults</Button>
        <Button onClick={handleSave} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
```

## The `updateNested` Callback Pattern

For config objects with grouped keys:

```tsx
const updateNested = useCallback(<
  G extends "overview" | "statements" | "analysis",
  K extends keyof ExportConfig[G],
>(group: G, key: K, value: ExportConfig[G][K]) => {
  setConfig((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
  setDirty(true);
}, []);
```

## Reusable Admin UI Components

### Card Style Constants (`styles.ts`)

| Constant | Classes | Usage |
|----------|---------|-------|
| `ADMIN_CARD` | `bg-card border border-border/80 shadow-sm rounded-xl` | Standard settings card |
| `ADMIN_LINK_CARD` | `group bg-card border ... hover:shadow-sm` | Clickable list items |
| `ADMIN_LINK_ICON` | `w-10 h-10 rounded-xl bg-muted ...` | Icon badge in list cards |
| `ADMIN_TEXTAREA` | Full textarea styles | Multi-line text inputs |
| `ADMIN_DIALOG` | `sm:max-w-lg` | Dialog width |

### Layout Components

| Component | Pattern | Usage |
|-----------|---------|-------|
| `SectionToggle` | Checkbox + label + description | Toggle boolean config fields |
| `SettingSwitch` | Switch + label + description | Toggle format/behavior settings |
| `GroupHeader` | Uppercase label + rule line | Visual group separator |
| `ContentCard` | Two-column split card | Houses related toggles |
| `SettingsCard` | Titled single-column card | Houses format switches |

## API Fetch/Save Flow

1. **Fetch:** `GET /api/admin/{config-name}` → returns current config (merged with defaults)
2. **Display:** Set local state from API response
3. **Edit:** User toggles update local state + set `dirty = true`
4. **Save:** `PUT /api/admin/{config-name}` → server validates with Zod, merges with stored config, persists to `global_assumptions`
5. **Confirm:** Server returns merged config → client updates state, clears dirty flag, shows toast

### Server-Side Pattern

```typescript
export function registerMyConfigRoutes(app: Express) {
  app.get("/api/admin/my-config", requireAdmin, async (_req, res) => {
    const ga = await storage.getGlobalAssumptions();
    res.json(mergeWithDefaults(ga.myConfig));
  });

  app.put("/api/admin/my-config", requireAdmin, async (req, res) => {
    const parsed = myConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid config" });
    const current = mergeWithDefaults(ga.myConfig);
    const merged = { ...current, ...parsed.data };
    await storage.upsertGlobalAssumptions({ myConfig: merged });
    res.json(merged);
  });
}
```

## Sidebar Freshness Badge

The Intelligence Engine group displays a freshness count badge when stale/missing properties exist:

- Badge polls `GET /api/admin/intelligence/freshness-counts` every 60s
- Red background if any `missing > 0`, amber if only `stale > 0`
- Shows total count of `stale + missing`
- `data-testid="intelligence-freshness-badge"`

## Adding a New Admin Section

1. Create component in `client/src/components/admin/` (or `admin/intelligence/` for engine sections)
2. Add `AdminSection` union member in `AdminSidebar.tsx`
3. Add section to `sectionMeta` object in `Admin.tsx`
4. Add `SectionContent` switch case in `Admin.tsx`
5. Add sidebar entry in `buildNavGroups()` in `AdminSidebar.tsx` with icon and label
6. Create server route in `server/routes/admin/` with Zod validation
7. Register route in `server/routes.ts`
8. If config is persisted, add field to `global_assumptions` schema and create migration

## Key Files

| File | Purpose |
|------|---------|
| `client/src/pages/Admin.tsx` | Admin shell + section routing (sectionMeta + SectionContent) |
| `client/src/components/admin/AdminSidebar.tsx` | Sidebar navigation, 5-group structure, redirects, freshness badge |
| `client/src/components/admin/styles.ts` | Card style constants |
| `client/src/components/admin/intelligence/` | Intelligence Engine section components |
| `server/routes/admin/` | Admin API route files |
