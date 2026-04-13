---
name: ui-blocks
description: UI block reference patterns from shadcn blocks. Templates and patterns for building new pages or layouts. Use as reference when designing new page layouts.
---

# UI Block Reference Patterns

Reference source code from shadcn blocks, fetched via `npx shadcn@latest add`. These are templates and patterns — not active app components. Use them as reference when building new pages or layouts.

## Fetched Blocks

### dashboard-01
**Source:** `npx shadcn@latest add dashboard-01`
**Files created:**
- `app/dashboard/page.tsx` — Dashboard layout with sidebar + header + content grid
- `client/src/components/chart-area-interactive.tsx` — Interactive area chart with date range selector
- `client/src/components/data-table.tsx` — Full-featured data table with sorting, filtering, drag-and-drop rows
- `client/src/components/nav-documents.tsx` — Document nav section for sidebar
- `client/src/components/nav-projects.tsx` — Project nav section with favorites
- `client/src/components/nav-secondary.tsx` — Secondary nav links (settings, help)

**Patterns demonstrated:**
- `SidebarProvider` + `AppSidebar` + `SidebarInset` layout structure
- Header with `SidebarTrigger` + `Separator` + `Breadcrumb`
- Stats cards grid (`md:grid-cols-3`)
- Chart cards with interactive selectors
- Data table with `@tanstack/react-table` + `dnd-kit` sorting

### sidebar-07
**Source:** `npx shadcn@latest add sidebar-07`
**Files created/updated:**
- `client/src/components/app-sidebar.tsx` — Inset sidebar with nav groups
- `client/src/components/nav-main.tsx` — Main nav with collapsible sub-items
- `client/src/components/nav-user.tsx` — User avatar + dropdown menu in sidebar footer
- `client/src/components/team-switcher.tsx` — Team/workspace switcher in sidebar header

**Patterns demonstrated:**
- Sidebar inset layout (`variant="inset"`)
- Collapsible nav groups with `SidebarMenuSub`
- User menu with avatar in sidebar footer
- Team switcher dropdown in sidebar header

### login-03
**Source:** `npx shadcn@latest add login-03`
**Files created:**
- `client/src/components/login-form.tsx` — Login form with card layout

**Patterns demonstrated:**
- Centered login: `min-h-svh flex items-center justify-center bg-muted`
- Logo + brand name header with icon badge
- Card-based form with email/password + forgot password link
- Social login buttons (GitHub, Google)
- Sign-up link in footer

### login-04
**Source:** `npx shadcn@latest add login-04`
**Updated:** `client/src/components/login-form.tsx` (overwrote login-03 version)

**Patterns demonstrated:**
- Wide split-panel layout: `max-w-sm md:max-w-4xl`
- `md:grid-cols-2` with form on left, image/branding on right
- Hidden image panel on mobile, visible on `md:`

## Layout Patterns

### Centered Login
```tsx
<div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
  <div className="flex w-full max-w-sm flex-col gap-6">
    <Logo />
    <LoginForm />
  </div>
</div>
```

### Split-Panel Login
```tsx
<div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
  <div className="w-full max-w-sm md:max-w-4xl">
    <LoginForm />  {/* Uses grid-cols-2 internally */}
  </div>
</div>
```

### Sidebar + Content Layout
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <header className="flex h-16 shrink-0 items-center gap-2 border-b">
      <div className="flex items-center gap-2 px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="#">Section</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Current Page</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Content */}
    </div>
  </SidebarInset>
</SidebarProvider>
```

### Dashboard Content Grid
```tsx
<div className="flex flex-1 flex-col gap-4 p-4">
  <div className="grid auto-rows-min gap-4 md:grid-cols-3">
    <div className="aspect-video rounded-xl bg-muted/50" />
    <div className="aspect-video rounded-xl bg-muted/50" />
    <div className="aspect-video rounded-xl bg-muted/50" />
  </div>
  <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
</div>
```

## Important Notes
- These reference files live alongside the app's real components — they are not wired into routing
- The app's actual login page is `client/src/pages/Login.tsx`
- The app's actual sidebar is `client/src/components/Layout.tsx`
- Use these as pattern reference when redesigning or building new layouts
