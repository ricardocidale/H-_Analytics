---
name: admin-shell-template
description: Template for the slim Admin.tsx shell after refactoring. Use this as the target for T006.
---

# Admin.tsx Shell Template

After extracting all tab components, Admin.tsx should look like this:

```tsx
import { useState } from "react";
import Layout from "@/components/Layout";
import { Tabs, TabsContent, CurrentThemeTab } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Users, Building2, Activity, FileCheck, LayoutGrid,
  Upload, Image, SwatchBook, PanelLeft, Database
} from "lucide-react";

import type { AdminView } from "@/components/admin/types";
import { UsersTab } from "@/components/admin/UsersTab";
import { CompaniesTab } from "@/components/admin/CompaniesTab";
import { ActivityTab } from "@/components/admin/ActivityTab";
import { VerificationTab } from "@/components/admin/VerificationTab";
import { LogosTab } from "@/components/admin/LogosTab";
import { UserGroupsTab } from "@/components/admin/UserGroupsTab";
import { BrandingTab } from "@/components/admin/BrandingTab";
import { ThemesTab } from "@/components/admin/ThemesTab";
import { NavigationTab } from "@/components/admin/NavigationTab";
import { DatabaseTab } from "@/components/admin/DatabaseTab";

const ADMIN_TABS = [
  { value: 'users', label: 'Users', icon: Users },
  { value: 'companies', label: 'Companies', icon: Building2 },
  { value: 'activity', label: 'Activity', icon: Activity },
  { value: 'verification', label: 'Verification', icon: FileCheck },
  { value: 'user-groups', label: 'User Groups', icon: LayoutGrid },
  { value: 'logos', label: 'Logos', icon: Upload },
  { value: 'branding', label: 'Branding', icon: Image },
  { value: 'themes', label: 'Themes', icon: SwatchBook },
  { value: 'sidebar', label: 'Navigation', icon: PanelLeft },
  { value: 'database', label: 'Database', icon: Database },
] as const;

export default function Admin() {
  const [adminTab, setAdminTab] = useState<AdminView>("users");

  return (
    <TooltipProvider>
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Admin Settings"
          subtitle="Manage users, monitor activity, and run system verification"
          variant="dark"
        />

        <Tabs value={adminTab} onValueChange={(v) => setAdminTab(v as AdminView)} className="w-full">
          <CurrentThemeTab
            tabs={ADMIN_TABS}
            activeTab={adminTab}
            onTabChange={(v) => setAdminTab(v as AdminView)}
          />

          <TabsContent value="users" className="space-y-6 mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="companies" className="space-y-6 mt-6">
            <CompaniesTab />
          </TabsContent>
          <TabsContent value="activity" className="space-y-6 mt-6">
            <ActivityTab />
          </TabsContent>
          <TabsContent value="verification" className="space-y-6 mt-6">
            <VerificationTab />
          </TabsContent>
          <TabsContent value="user-groups" className="space-y-6 mt-6">
            <UserGroupsTab />
          </TabsContent>
          <TabsContent value="logos" className="space-y-6 mt-6">
            <LogosTab />
          </TabsContent>
          <TabsContent value="branding" className="space-y-6 mt-6">
            <BrandingTab />
          </TabsContent>
          <TabsContent value="themes" className="space-y-6 mt-6">
            <ThemesTab />
          </TabsContent>
          <TabsContent value="sidebar" className="space-y-6 mt-6">
            <NavigationTab />
          </TabsContent>
          <TabsContent value="database" className="space-y-6 mt-6">
            <DatabaseTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
    </TooltipProvider>
  );
}
```

## Target Metrics
- Admin.tsx: ~80 lines (just the shell)
- Each tab component: self-contained with own state, queries, mutations
- Total LOC should be similar but well-organized
