/**
 * Layout.tsx — Main application shell used by every authenticated page.
 *
 * Desktop: static sidebar (always visible, not collapsible).
 * Mobile: Sheet-based drawer opened via hamburger in header, plus bottom nav.
 */
import { APP_BRAND_NAME, BRAND_ACCENT_HEX, BRAND_ACCENT_PREFIX } from "@shared/constants";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Search } from "@/components/icons/themed-icons";

import { IconMenu, IconLogOut, IconDashboard, IconProperties, IconBriefcase, IconShield, IconProfile, IconScenarios, IconPropertyFinder, IconAnalysis, IconMapPin, IconHelp, IconCompass, IconMessageCircle, IconPresentation } from "@/components/icons";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useGlobalAssumptions } from "@/lib/api";
import defaultLogo from "@/assets/logo.png";
import CommandPalette from "@/components/CommandPalette";
import Breadcrumbs from "@/components/Breadcrumbs";
import NotificationCenter from "@/components/NotificationCenter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

import GuidedWalkthrough, { useWalkthroughStore } from "@/components/GuidedWalkthrough";
import { ResearchQueueIndicator } from "@/components/research/ResearchQueueIndicator";
import { GuidanceSideSheet } from "@/components/research/GuidanceSideSheet";
import { RebeccaPanel } from "@/components/rebecca/RebeccaPanel";
import { usePanelManager, isRebeccaRailVisible } from "@/lib/panel-manager";

import { applyThemeColors, resetThemeColors, type ThemeColor as DesignColor } from "@/lib/theme";
import { applyColorMode, applyFont, applyBgAnimation, startOsColorModeListener, stopOsColorModeListener, resolveColorMode, resolveFontPreference, resolveBgAnimation } from "@/lib/theme/appearance";
import type { ColorMode, FontPreference, BgAnimation, AppearanceDefaults } from "@/lib/theme/appearance";
import { useAdminSection } from "@/lib/admin-nav";
import { useIntelligenceSection } from "@/lib/intelligence-nav";
import { resolveSection, AdminSidebarNav } from "@/components/admin/AdminSidebar";
import type { AdminSection } from "@/components/admin/AdminSidebar";
import { IntelligenceSidebarNav } from "@/components/intelligence/IntelligenceSidebar";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; onClick?: () => void };

function ScenarioIndicator() {
  const { isDirty, activeScenarioName } = useScenarioDirtyState();
  const { user } = useAuth();

  if (!user) return null;

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map(n => n![0])
    .join("")
    .toUpperCase() || user.email[0].toUpperCase();

  const displayName = activeScenarioName || `${initials} Default`;

  return (
    <div
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground max-w-[200px]"
      data-testid="indicator-active-scenario"
    >
      <IconScenarios className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{displayName}</span>
      {isDirty && (
        <span className="w-2 h-2 rounded-full bg-accent-pop shrink-0" data-testid="indicator-dirty-dot" />
      )}
    </div>
  );
}

function RebeccaHeaderButton({ displayName }: { displayName: string }) {
  const isActive = usePanelManager(isRebeccaRailVisible);
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        const s = usePanelManager.getState();
        if (isRebeccaRailVisible(s)) s.closeRebecca();
        else s.openRebecca();
      }}
      className={cn("h-8 w-8 relative", isActive && "bg-primary/10")}
      data-testid="button-rebecca-toggle"
      title={displayName}
      aria-label={isActive ? `Close ${displayName}` : `Open ${displayName}`}
    >
      <IconMessageCircle className="w-4 h-4" />
    </Button>
  );
}

interface NavGroupDef {
  label: string;
  items: NavLink[];
  dividerAfter?: boolean;
}

function SidebarNav({ groups, isActiveLink, onNavigate }: { groups: NavGroupDef[]; isActiveLink: (href: string) => boolean; onNavigate?: () => void }) {
  return (
    <SidebarProvider
      defaultOpen
      className="min-h-0 w-full bg-transparent"
      style={{ "--sidebar-width": "100%" } as React.CSSProperties}
    >
      <Sidebar collapsible="none" className="w-full bg-transparent text-sidebar-foreground">
        <SidebarContent className="bg-transparent gap-1 px-2 py-2">
          {groups.filter(g => g.items.length > 0).map((group, idx) => {
            const key = group.label || `misc-${idx}`;
            return (
              <SidebarGroup key={key} className="p-0">
                <SidebarMenu>
                  <SidebarMenuItem>
                    {group.label && (
                      <SidebarGroupLabel className="mb-0.5 gap-1.5">
                        <span className="truncate tracking-wide">{group.label}</span>
                      </SidebarGroupLabel>
                    )}
                    <SidebarMenuSub>
                      {group.items.map((item) => {
                        const active = isActiveLink(item.href);
                        const isAction = item.href.startsWith("#");
                        return (
                          <SidebarMenuSubItem key={item.href}>
                            {isAction ? (
                              <SidebarMenuSubButton
                                isActive={active}
                                onClick={() => { item.onClick?.(); onNavigate?.(); }}
                                className="cursor-pointer"
                                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <item.icon className="size-4 shrink-0" />
                                <span className="truncate">{item.label}</span>
                              </SidebarMenuSubButton>
                            ) : (
                              <SidebarMenuSubButton
                                isActive={active}
                                asChild
                              >
                                <Link
                                  href={item.href}
                                  onClick={onNavigate}
                                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <item.icon className="size-4 shrink-0" />
                                  <span className="truncate">{item.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            )}
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
                {group.dividerAfter && <div className="mx-2 border-t border-border/50 mt-1" />}
              </SidebarGroup>
            );
          })}
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

export default function Layout({ children, darkMode }: { children: React.ReactNode; darkMode?: boolean }) {
  const [location] = useLocation();
  const { user, isAdmin, requestLogout } = useAuth();
  const { data: global } = useGlobalAssumptions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const rebeccaRailOpen = usePanelManager(isRebeccaRailVisible);
  const rebeccaRailUserPref = usePanelManager((s) => s.rebeccaRailUserPref);
  const rebeccaHydrated = usePanelManager((s) => s.hydrated);
  const rebeccaEnabled = !!global?.rebeccaEnabled && !user?.rebeccaOptOut;

  // Reset hydration when the logged-in user changes (logout / re-login as
  // a different user in the same SPA session) so the next pass re-hydrates
  // the rail preference from the new user's server record.
  const lastHydratedUserId = useRef<number | null>(null);
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (lastHydratedUserId.current !== null && lastHydratedUserId.current !== currentId) {
      usePanelManager.getState().resetHydration();
    }
    lastHydratedUserId.current = currentId;
  }, [user?.id]);

  // Hydrate the rail's open/closed preference from the server-side user record.
  useEffect(() => {
    if (!user || rebeccaHydrated) return;
    usePanelManager.getState().hydrate(!!user.rebeccaRailOpen);
  }, [user, rebeccaHydrated]);

  // Persist changes to the rail open/closed preference back to the server (debounced).
  useEffect(() => {
    if (!user || !rebeccaHydrated) return;
    if (rebeccaRailUserPref === !!user.rebeccaRailOpen) return;
    const handle = window.setTimeout(() => {
      void fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rebeccaRailOpen: rebeccaRailUserPref }),
      }).catch(() => { /* best-effort; UI already reflects state */ });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [rebeccaRailUserPref, rebeccaHydrated, user]);

  const { data: myBranding } = useQuery<{ logoUrl: string | null; themeName: string | null; themeColors: DesignColor[] | null; groupCompanyName: string | null }>({
    queryKey: ["my-branding"],
    queryFn: async () => {
      const res = await fetch("/api/my-branding", { credentials: "include" });
      if (!res.ok) return { logoUrl: null, themeName: null, groupCompanyName: null };
      return res.json();
    },
    enabled: !!user,
  });

  const { data: appearanceDefaults } = useQuery<AppearanceDefaults>({
    queryKey: ["appearance-defaults"],
    queryFn: async () => {
      const res = await fetch("/api/appearance-defaults", { credentials: "include" });
      if (!res.ok) return { defaultColorMode: null, defaultBgAnimation: null, defaultFontPreference: null };
      return res.json();
    },
    enabled: !!user,
  });

  const _companyName = global?.companyName || "Hospitality Business";
  const companyLogo = global?.companyLogoUrl || global?.companyLogo || defaultLogo;

  useEffect(() => {
    if (myBranding?.themeColors?.length) {
      applyThemeColors(myBranding.themeColors as DesignColor[]);
    } else {
      resetThemeColors();
    }
    return () => { resetThemeColors(); };
  }, [myBranding?.themeName, myBranding?.themeColors]);

  useEffect(() => {
    if (user) {
      const orgColorMode = appearanceDefaults?.defaultColorMode as ColorMode | null | undefined;
      const orgBgAnim = appearanceDefaults?.defaultBgAnimation as BgAnimation | null | undefined;
      const orgFont = appearanceDefaults?.defaultFontPreference as FontPreference | null | undefined;
      const mode = resolveColorMode(user.colorMode as ColorMode | null, orgColorMode);
      applyColorMode(mode);
      startOsColorModeListener(mode);
      applyFont(resolveFontPreference(user.fontPreference as FontPreference | null, orgFont));
      applyBgAnimation(resolveBgAnimation(user.bgAnimation as BgAnimation | null, orgBgAnim));
    }
    return () => { stopOsColorModeListener(); };
  }, [user?.colorMode, user?.fontPreference, user?.bgAnimation, appearanceDefaults]);

  useEffect(() => { setMobileOpen(false); }, [location]);

  const sb = (key: string) => (global as unknown as Record<string, unknown>)?.[key] !== false;
  const showAnalysis = sb("sidebarSensitivity");
  const onAdminRoute = location.startsWith("/admin");
  const onIntelligenceRoute = location.startsWith("/intelligence");
  const [adminSection, setAdminSectionState] = useAdminSection();
  const [intelligenceSection, setIntelligenceSectionState] = useIntelligenceSection();

  const homeNavGroups: NavGroupDef[] = useMemo(() => [
    {
      label: "Home",
      items: [
        { href: "/", label: "Dashboard", icon: IconDashboard },
        { href: "/portfolio", label: "Properties", icon: IconProperties },
        { href: "/company", label: "Management Co", icon: IconBriefcase },
      ],
    },
    {
      label: "Intelligence",
      items: [
        ...(showAnalysis ? [{ href: "/analysis", label: "Simulation", icon: IconAnalysis }] : []),
        ...(sb("sidebarPropertyFinder") ? [{ href: "/property-finder", label: "Property Finder", icon: IconPropertyFinder }] : []),
        ...(sb("sidebarMapView") ? [{ href: "/map", label: "Map View", icon: IconMapPin }] : []),
      ].filter(Boolean),
    },
    {
      label: "Settings",
      items: [
        { href: "/profile", label: "My Profile", icon: IconProfile },
        ...(sb("sidebarScenarios") ? [{ href: "/scenarios", label: "Scenarios", icon: IconScenarios }] : []),
      ],
    },
  ].filter(g => g.items.length > 0), [isAdmin, global]);

  // Admin nav is rendered via <AdminSidebarNav> (shadcn SidebarMenuSub block)
  // when onAdminRoute is true — see desktop aside / mobile Sheet below.
  const navGroups = homeNavGroups;

  const isActiveLink = (href: string) => {
    if (href.startsWith("#admin-")) {
      const section = href.replace("#admin-", "") as AdminSection;
      const sectionResolved = resolveSection(section);
      const isAlias = section !== sectionResolved;
      if (isAlias) {
        return adminSection === section;
      }
      return resolveSection(adminSection) === sectionResolved;
    }
    return location === href ||
      (href === "/portfolio" && location.startsWith("/property/")) ||
      (href !== "/" && location.startsWith(href + "/"));
  };

  const sidebarHeader = (
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
      <img src={companyLogo} alt={APP_BRAND_NAME} className="w-12 h-12 object-contain" data-testid="img-company-logo" />
      <h1 className="text-sm font-semibold text-foreground truncate"><span style={{ color: BRAND_ACCENT_HEX }}>{BRAND_ACCENT_PREFIX}</span>{APP_BRAND_NAME.slice(BRAND_ACCENT_PREFIX.length)}</h1>
    </div>
  );

  const sidebarFooter = (
    <div className="mt-auto px-2 pb-3 pt-1 space-y-0.5">
      {location === "/" && (
        <Button
          variant="ghost"
          onClick={() => {
            setMobileOpen(false);
            useWalkthroughStore.getState().triggerPrompt();
          }}
          className="flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors justify-start font-normal"
          data-testid="nav-tour"
        >
          <IconCompass className="w-4 h-4 shrink-0" />
          <span>Tour</span>
        </Button>
      )}
      {sb("sidebarUserManual") && (
        <Link href="/help" onClick={() => setMobileOpen(false)}>
          <span
            className={cn(
              "flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] transition-colors",
              isActiveLink("/help") ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            data-testid="nav-help"
          >
            <IconHelp className="w-4 h-4 shrink-0" />
            <span>Help</span>
          </span>
        </Link>
      )}
      {isAdmin && !onAdminRoute && !onIntelligenceRoute && (
        <Link href="/admin" onClick={() => setMobileOpen(false)}>
          <span
            className={cn(
              "flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] transition-colors",
              isActiveLink("/admin") ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            data-testid="nav-admin"
          >
            <IconShield className="w-4 h-4 shrink-0" />
            <span>Admin</span>
          </span>
        </Link>
      )}
      {isAdmin && (
        <Link href="/lb-slides" onClick={() => setMobileOpen(false)}>
          <span
            className={cn(
              "flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] transition-colors",
              isActiveLink("/lb-slides") ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            data-testid="nav-slides"
          >
            <IconPresentation className="w-4 h-4 shrink-0" />
            <span>Slides</span>
          </span>
        </Link>
      )}
      {!onIntelligenceRoute && (
        <>
          <Separator className="my-2" />
          {user && (
            <div className="flex items-center px-3 py-1.5" data-testid="sidebar-user-info">
              <span className="text-[12px] text-muted-foreground/80 truncate" data-testid="sidebar-user-firstname">
                {user.name || user.firstName || user.email}
              </span>
            </div>
          )}
          <Separator className="my-2" />
          <Button
            variant="ghost"
            onClick={() => { requestLogout(); setMobileOpen(false); }}
            className="flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors justify-start"
            data-testid="button-logout"
          >
            <IconLogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </Button>
        </>
      )}
      <div className="flex items-center justify-center gap-2 pt-2 px-3">
        <Link href="/about" onClick={() => setMobileOpen(false)}>
          <span className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">About</span>
        </Link>
        <span className="text-[11px] text-muted-foreground/30">&middot;</span>
        <Link href="/privacy" onClick={() => setMobileOpen(false)}>
          <span className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">Privacy</span>
        </Link>
        <span className="text-[11px] text-muted-foreground/30">&middot;</span>
        <Link href="/terms" onClick={() => setMobileOpen(false)}>
          <span className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">Terms</span>
        </Link>
        <span className="text-[11px] text-muted-foreground/30">&middot;</span>
        <Link href="/cookies" onClick={() => setMobileOpen(false)}>
          <span className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">Cookies</span>
        </Link>
      </div>
      <p className="text-center text-[10px] text-muted-foreground/30 pt-1 pb-2" data-testid="text-powered-by-norfolk">Powered by Norfolk AI</p>
    </div>
  );

  return (
    <div className="flex min-h-svh w-full">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-svh sticky top-0">
        {sidebarHeader}
        {onIntelligenceRoute ? (
          <div className="flex-1 overflow-y-auto pt-1">
            <IntelligenceSidebarNav
              activeSection={intelligenceSection}
              onSectionChange={setIntelligenceSectionState}
            />
          </div>
        ) : onAdminRoute ? (
          <div className="flex-1 overflow-y-auto pt-1">
            <AdminSidebarNav
              activeSection={adminSection}
              onSectionChange={setAdminSectionState}
            />
          </div>
        ) : (
          <SidebarNav groups={navGroups} isActiveLink={isActiveLink} />
        )}
        {sidebarFooter}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground flex flex-col h-full">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          {sidebarHeader}
          {onIntelligenceRoute ? (
            <div className="flex-1 overflow-y-auto pt-1">
              <IntelligenceSidebarNav
                activeSection={intelligenceSection}
                onSectionChange={(s) => { setIntelligenceSectionState(s); setMobileOpen(false); }}
              />
            </div>
          ) : onAdminRoute ? (
            <div className="flex-1 overflow-y-auto pt-1">
              <AdminSidebarNav
                activeSection={adminSection}
                onSectionChange={(s) => { setAdminSectionState(s); setMobileOpen(false); }}
              />
            </div>
          ) : (
            <SidebarNav groups={navGroups} isActiveLink={isActiveLink} onNavigate={() => setMobileOpen(false)} />
          )}
          {sidebarFooter}
        </SheetContent>
      </Sheet>

      <main className={cn(
          "relative flex-1 flex flex-col min-w-0 overflow-hidden transition-[margin-right] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
          darkMode ? "bg-foreground text-white" : "bg-background text-foreground",
          rebeccaRailOpen && "md:mr-[360px]",
        )}>
        <header className="h-12 shrink-0 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8"
              onClick={() => setMobileOpen(true)}
              data-testid="button-mobile-menu"
              aria-label="Open menu"
            >
              <IconMenu className="w-5 h-5" />
            </Button>
            <Breadcrumbs />
          </div>
          <ScenarioIndicator />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
                document.dispatchEvent(event);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 h-auto rounded-md bg-muted text-muted-foreground hover:text-muted-foreground text-xs transition-colors border border-border"
              data-testid="button-search"
            >
              <Search className="w-3.5 h-3.5" />
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">⌘K</kbd>
            </Button>
            <ResearchQueueIndicator className="hidden sm:flex" />
            <NotificationCenter />
            {rebeccaEnabled && (
              <RebeccaHeaderButton displayName={global?.rebeccaDisplayName || "Rebecca"} />
            )}
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 lg:px-8 lg:py-6 pb-20 md:pb-6 lg:pb-6">
          {children}
        </div>
      </main>

      {(() => {
        const bottomNavItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
          { href: "/", label: "Dashboard", icon: IconDashboard },
          { href: "/portfolio", label: "Properties", icon: IconProperties },
          { href: "/company", label: "Company", icon: IconBriefcase },
          { href: "/profile", label: "Profile", icon: IconProfile },
        ];
        return (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40" data-testid="mobile-bottom-nav">
            <div className="absolute inset-0 bg-sidebar" />
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-sidebar-border" />
            <div className="relative flex items-center justify-around px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
              {bottomNavItems.map((item) => {
                const isActive = location === item.href ||
                  (item.href === "/portfolio" && location.startsWith("/property/")) ||
                  (item.href !== "/" && location.startsWith(item.href + "/"));
                return (
                  <Link key={item.href} href={item.href}>
                    <Button variant="ghost" className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[3.5rem] h-auto" data-testid={`bottom-nav-${item.label.toLowerCase()}`}>
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200",
                        isActive ? "bg-muted" : ""
                      )}>
                        <item.icon className={cn("w-[18px] h-[18px]", isActive ? "text-foreground" : "text-muted-foreground")} />
                      </div>
                      <span className={cn("text-[10px] leading-tight", isActive ? "text-foreground font-medium" : "text-muted-foreground")}>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </nav>
        );
      })()}

      <CommandPalette />
      <GuidedWalkthrough />
      <GuidanceSideSheet />
      {rebeccaEnabled && (
        <RebeccaPanel displayName={global?.rebeccaDisplayName || "Rebecca"} />
      )}
    </div>
  );
}
