---
name: tab-extraction-guide
description: Step-by-step guide for extracting a tab from Admin.tsx into a standalone component. Covers imports, state, queries, mutations, render, and dialog extraction.
---

# Tab Extraction Guide

## Pattern for Each Tab Component

Every extracted tab follows this structure:

```tsx
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
// ... UI imports (only what's used)
// ... type imports from ./types

export function XxxTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 1. Local state (moved from Admin.tsx)
  // 2. Queries (moved from Admin.tsx, remove `enabled` tab guard)
  // 3. Mutations (moved from Admin.tsx)
  // 4. Helper functions
  // 5. Return JSX (the render function body)
  // 6. Inline dialogs (if owned by this tab)
}
```

## Key Rules

1. **No props** — Each tab fetches its own data internally
2. **Remove `enabled` tab guards** — Admin.tsx shell only renders the active tab, so the component mounts = tab is active
3. **Own your dialogs** — If a dialog is only used by this tab, move it inside the component
4. **Preserve data-testid** — Every `data-testid` must remain exactly as-is
5. **Preserve all classNames** — No visual changes during extraction
6. **Import types from `./types`** — All interfaces come from the shared types file

## Import Mapping

Common imports used across tabs:

```tsx
// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GlassButton } from "@/components/ui/glass-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Feature components
import { AIImagePicker } from "@/components/ui/ai-image-picker";
import { ThemeManager } from "@/features/design-themes";

// Utilities
import { formatDateTime, formatDuration } from "@/lib/formatters";
import { formatMoney } from "@/lib/financial/utils";
import { invalidateAllFinancialQueries } from "@/lib/api";

// Assets
import defaultLogo from "@/assets/logo.png";
```

## Query Key Convention

All admin queries use `["admin", "xxx"]` keys:
- `["admin", "users"]`
- `["admin", "login-logs"]`
- `["admin", "logos"]`
- `["admin", "companies"]`
- `["admin", "user-groups"]`
- `["admin", "all-themes"]`
- `["admin", "asset-descriptions"]`
- `["admin", "activity-logs", entityFilter, userFilter]`
- `["admin", "checker-activity"]`
- `["admin", "verification-history"]`
- `["admin", "active-sessions"]`
- `["globalAssumptions"]` (shared, not admin-prefixed)

## Mutation Invalidation Patterns

After user CRUD: invalidate `["admin", "users"]`
After company CRUD: invalidate `["admin", "companies"]`, `["companies"]`
After logo CRUD: invalidate `["admin", "logos"]`, `["my-branding"]`
After group CRUD: invalidate `["admin", "user-groups"]`, sometimes `["admin", "users"]`
After asset desc CRUD: invalidate `["admin", "asset-descriptions"]`
After global assumptions: call `invalidateAllFinancialQueries(queryClient)`

## Tab-to-File Mapping

| Tab Value | Component | File |
|-----------|-----------|------|
| users | UsersTab | `client/src/components/admin/UsersTab.tsx` |
| companies | CompaniesTab | `client/src/components/admin/CompaniesTab.tsx` |
| activity | ActivityTab | `client/src/components/admin/ActivityTab.tsx` |
| verification | VerificationTab | `client/src/components/admin/VerificationTab.tsx` |
| logos | LogosTab | `client/src/components/admin/LogosTab.tsx` |
| user-groups | UserGroupsTab | `client/src/components/admin/UserGroupsTab.tsx` |
| branding | BrandingTab | `client/src/components/admin/BrandingTab.tsx` |
| themes | ThemesTab | `client/src/components/admin/ThemesTab.tsx` |
| sidebar | NavigationTab | `client/src/components/admin/NavigationTab.tsx` |
| database | DatabaseTab | `client/src/components/admin/DatabaseTab.tsx` |
