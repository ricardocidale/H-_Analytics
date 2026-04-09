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
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconMenu, IconLogOut, IconDashboard, IconProperties, IconBriefcase, IconShield, IconProfile, IconScenarios, IconPropertyFinder, IconAnalysis, IconMapPin, IconHelp, IconResearch, IconTarget, IconHome, IconCompass, IconMessageCircle } from "@/components/icons";
import { useState, useEffect, useMemo } from "react";
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

import GuidedWalkthrough, { useWalkthroughStore } from "@/components/GuidedWalkthrough";
import { RebeccaChatbot } from "@/components/RebeccaChatbot";
import { ResearchQueueIndicator } from "@/components/research/ResearchQueueIndicator";
import { GuidanceSideSheet } from "@/components/research/GuidanceSideSheet";
import { RebeccaPanel } from "@/components/rebecca/RebeccaPanel";
import { usePanelManager } from "@/lib/panel-manager";

import { applyThemeColors, resetThemeColors, type ThemeColor as DesignColor } from "@/lib/theme";
import { applyColorMode, applyFont, applyBgAnimation, startOsColorModeListener, stopOsColorModeListener, resolveColorMode, resolveFontPreference, resolveBgAnimation } from "@/lib/theme/appearance";
import type { ColorMode, FontPreference, BgAnimation, AppearanceDefaults } from "@/lib/theme/appearance";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconSetProvider } from "@/components/icons/IconSetContext";
import type { IconSetType } from "@/features/design-themes/types";
import { useAdminSection } from "@/lib/admin-nav";
import { buildNavGroups, resolveSection } from "@/components/admin/AdminSidebar";
import type { AdminSection } from "@/components/admin/AdminSidebar";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";

type NavLink = { href: string; label: string; icon: any; onClick?: () => void };

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
  const { openRebecca, activePanel } = usePanelManager();
  const isActive = activePanel === "rebecca";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => isActive ? usePanelManager.getState().closeAll() : openRebecca()}
      className={cn("h-8 w-8 relative", isActive && "bg-primary/10")}
      data-testid="button-rebecca-toggle"
      title={displayName}
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
    <nav className="flex-1 overflow-y-auto px-2 pt-1 space-y-1">
      {groups.filter(g => g.items.length > 0).map((group, idx) => (
        <div key={group.label || `misc-${idx}`}>
          <div className="py-1">
            {group.label && (
              <p className="text-[11px] font-medium text-muted-foreground px-3 pb-1 pt-2">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActiveLink(item.href);
                const isAction = item.href.startsWith("#");
                return (
                  <li key={item.href}>
                    {isAction ? (
                      <Button
                        variant="ghost"
                        onClick={() => { item.onClick?.(); onNavigate?.(); }}
                        className={cn(
                          "flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] transition-colors justify-start",
                          active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </Button>
                    ) : (
                      <Link href={item.href} onClick={onNavigate}>
                        <span
                          className={cn(
                            "flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] transition-colors",
                            active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                          data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {group.dividerAfter && (
            <div className="mx-3 my-1 border-b border-sidebar-border" />
          )}
        </div>
      ))}
    </nav>
  );
}

export default function Layout({ children, darkMode }: { children: React.ReactNode; darkMode?: boolean }) {
  const [location] = useLocation();
  const { user, isAdmin, isInvestor, hasManagementAccess, requestLogout } = useAuth();
  const { data: global } = useGlobalAssumptions();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: myBranding } = useQuery<{ logoUrl: string | null; themeName: string | null; themeColors: DesignColor[] | null; groupCompanyName: string | null; iconSet?: string }>({
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

  const companyName = global?.companyName || "Hospitality Business";
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

  const sb = (key: string) => (global as any)?.[key] !== false;
  const showAnalysis = sb("sidebarSensitivity");
  const onAdminRoute = location.startsWith("/admin");
  const [adminSection, setAdminSectionState] = useAdminSection();

  const homeNavGroups: NavGroupDef[] = useMemo(() => [
    {
      label: "Home",
      items: [
        { href: "/", label: "Dashboard", icon: IconDashboard },
        { href: "/portfolio", label: "Properties", icon: IconProperties },
        ...(hasManagementAccess ? [{ href: "/company", label: "Management Company", icon: IconBriefcase }] : []),
      ],
    },
    {
      label: "Intelligence",
      items: [
        ...(showAnalysis && hasManagementAccess ? [{ href: "/analysis", label: "Simulation", icon: IconAnalysis }] : []),
        ...(sb("sidebarPropertyFinder") && hasManagementAccess ? [{ href: "/property-finder", label: "Property Finder", icon: IconPropertyFinder }] : []),
        ...(sb("sidebarMapView") && hasManagementAccess ? [{ href: "/map", label: "Map View", icon: IconMapPin }] : []),
      ].filter(Boolean),
    },
    {
      label: "Settings",
      items: [
        { href: "/profile", label: "My Profile", icon: IconProfile },
        ...(sb("sidebarScenarios") && hasManagementAccess ? [{ href: "/scenarios", label: "Scenarios", icon: IconScenarios }] : []),
      ],
    },
  ].filter(g => g.items.length > 0), [hasManagementAccess, isAdmin, global]);

  const adminNavGroups = buildNavGroups();
  const adminSidebarGroups: NavGroupDef[] = useMemo(() => {
    const groups: NavGroupDef[] = [
      {
        label: "",
        items: [{ href: "/", label: "Home", icon: IconHome }],
        dividerAfter: true,
      },
    ];
    for (const ag of adminNavGroups) {
      groups.push({
        label: ag.label,
        items: ag.sections.map((s) => ({
          href: `#admin-${s.value}`,
          label: s.label,
          icon: s.icon,
          onClick: () => setAdminSectionState(s.value),
        })),
      });
    }
    groups.push({
      label: "Logs",
      items: [{
        href: "#admin-activity",
        label: "Activity",
        icon: IconDashboard,
        onClick: () => setAdminSectionState("activity"),
      }],
    });
    return groups;
  }, [adminNavGroups]);

  const navGroups = onAdminRoute ? adminSidebarGroups : homeNavGroups;

  const isActiveLink = (href: string) => {
    if (href.startsWith("#admin-")) {
      const section = href.replace("#admin-", "") as AdminSection;
      return resolveSection(adminSection) === resolveSection(section);
    }
    return location === href ||
      (href === "/portfolio" && location.startsWith("/property/")) ||
      (href !== "/" && location.startsWith(href + "/"));
  };

  const sidebarHeader = (
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
      <img src={companyLogo} alt={APP_BRAND_NAME} className="w-12 h-12 object-contain" />
      <h1 className="text-sm font-semibold text-foreground truncate"><span style={{ color: BRAND_ACCENT_HEX }}>{BRAND_ACCENT_PREFIX}</span>{APP_BRAND_NAME.slice(BRAND_ACCENT_PREFIX.length)}</h1>
    </div>
  );

  const sidebarFooter = (
    <div className="px-2 pb-3 pt-1 space-y-0.5">
      {!onAdminRoute && (
        <button
          onClick={() => {
            setMobileOpen(false);
            useWalkthroughStore.getState().triggerPrompt();
          }}
          className="flex items-center gap-2.5 w-full h-8 px-3 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          data-testid="nav-tour"
        >
          <IconCompass className="w-4 h-4 shrink-0" />
          <span>Tour</span>
        </button>
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
      {isAdmin && !onAdminRoute && (
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
      <Separator className="my-2" />
      {user && (
        <div className="flex items-center gap-2 px-3 py-1.5" data-testid="sidebar-user-info">
          <UserAvatar
            firstName={user.firstName}
            lastName={user.lastName}
            name={user.name}
            email={user.email}
            logoUrl={myBranding?.logoUrl}
            size="sm"
          />
          <span className="text-[12px] text-muted-foreground/80 truncate" data-testid="sidebar-user-firstname">
            {user.firstName || (user.name ? user.name.trim().split(/\s+/)[0] : "")}
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
      </div>
    </div>
  );

  const activeIconSet: IconSetType = (myBranding?.iconSet === "phosphor" ? "phosphor" : myBranding?.iconSet === "material" ? "material" : "lucide");

  return (
    <IconSetProvider value={activeIconSet}>
    <div className="flex min-h-svh w-full">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-svh sticky top-0">
        {sidebarHeader}
        <SidebarNav groups={navGroups} isActiveLink={isActiveLink} />
        {sidebarFooter}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          {sidebarHeader}
          <SidebarNav groups={navGroups} isActiveLink={isActiveLink} onNavigate={() => setMobileOpen(false)} />
          {sidebarFooter}
        </SheetContent>
      </Sheet>

      <main className={cn("relative flex-1 flex flex-col min-w-0 overflow-hidden", darkMode ? "bg-foreground text-white" : "bg-background text-foreground")}>
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
            {!!(global as any)?.rebeccaEnabled && (
              (global as any)?.rebeccaV2
                ? <RebeccaHeaderButton displayName={(global as any)?.rebeccaDisplayName || "Rebecca"} />
                : <RebeccaChatbot displayName={(global as any)?.rebeccaDisplayName || "Rebecca"} />
            )}
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 lg:px-8 lg:py-6 pb-20 md:pb-6 lg:pb-6">
          {children}
        </div>
      </main>

      {(() => {
        const bottomNavItems: { href: string; label: string; icon: any }[] = [
          { href: "/", label: "Dashboard", icon: IconDashboard },
          { href: "/portfolio", label: "Properties", icon: IconProperties },
          ...(hasManagementAccess ? [{ href: "/company", label: "Company", icon: IconBriefcase }] : []),
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
      {!!(global as any)?.rebeccaEnabled && !!(global as any)?.rebeccaV2 && (
        <RebeccaPanel displayName={(global as any)?.rebeccaDisplayName || "Rebecca"} />
      )}
    </div>
    </IconSetProvider>
  );
}
