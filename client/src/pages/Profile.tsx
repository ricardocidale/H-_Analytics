import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconUser, IconEye, IconEyeOff, IconKey, IconClipboardCheck, IconPalette } from "@/components/icons";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { SaveButton } from "@/components/ui/save-button";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useGlobalAssumptions } from "@/lib/api/admin";
import { UserRole, isAdminRole } from "@shared/constants";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import type { ColorMode, BgAnimation, FontPreference, AppearanceDefaults } from "@/lib/theme/appearance";
import { applyColorMode, applyFont, applyBgAnimation, startOsColorModeListener, resolveColorMode, resolveFontPreference, resolveBgAnimation } from "@/lib/theme/appearance";
import { Sun, Moon, Monitor, Sparkles } from "lucide-react";

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, refetch } = useAuth();
  const { data: global } = useGlobalAssumptions();
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    title: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [isDirty, setIsDirty] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  interface AvailableTheme {
    id: number;
    name: string;
    description: string;
    isDefault: boolean;
    colors: Array<{ rank: number; name: string; hexCode: string; description: string }>;
  }

  const { data: availableThemes } = useQuery<AvailableTheme[]>({
    queryKey: ["/api/available-themes"],
    enabled: !!user,
  });

  const { data: myBranding } = useQuery<{ selectedThemeId: number | null }>({
    queryKey: ["/api/my-branding"],
    enabled: !!user,
  });

  const { data: appearanceDefaults } = useQuery<AppearanceDefaults>({
    queryKey: ["/api/appearance-defaults"],
    enabled: !!user,
  });

  const themeMutation = useMutation({
    mutationFn: async (themeId: number | null) => {
      const res = await apiRequest("PATCH", "/api/profile/theme", { themeId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/available-themes"] });
      toast({ title: "Theme Updated", description: "Your theme preference has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const appearanceMutation = useMutation({
    mutationFn: async (data: { colorMode?: ColorMode | null; bgAnimation?: BgAnimation | null; fontPreference?: FontPreference | null }) => {
      const res = await apiRequest("PATCH", "/api/profile/appearance", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      refetch();
      if (variables.colorMode !== undefined) {
        const mode = resolveColorMode(variables.colorMode, appearanceDefaults?.defaultColorMode as ColorMode | null);
        applyColorMode(mode);
        startOsColorModeListener(mode);
      }
      if (variables.fontPreference !== undefined) {
        applyFont(resolveFontPreference(variables.fontPreference, appearanceDefaults?.defaultFontPreference as FontPreference | null));
      }
      if (variables.bgAnimation !== undefined) {
        applyBgAnimation(resolveBgAnimation(variables.bgAnimation, appearanceDefaults?.defaultBgAnimation as BgAnimation | null));
      }
      toast({ title: "Appearance Updated", description: "Your preference has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rebeccaToggleMutation = useMutation({
    mutationFn: async (optOut: boolean) => {
      const res = await apiRequest("PATCH", "/api/profile", { rebeccaOptOut: optOut });
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Preference Saved", description: "Rebecca preference updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        company: user.company || "",
        title: user.title || "",
      });
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string; email?: string; company?: string; title?: string }) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setIsDirty(false);
      toast({ title: "Profile Updated", description: "Your profile has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("PATCH", "/api/profile/password", data);
      return res.json();
    },
    onSuccess: () => {
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password Updated", description: "Your password has been changed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (user && isAdminRole(user.role)) {
      const { ...rest } = formData;
      updateMutation.mutate(rest);
    } else {
      updateMutation.mutate(formData);
    }
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    passwordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  if (!user) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <AnimatedPage>
      <div className="max-w-7xl mx-auto p-0 sm:p-6 space-y-6 sm:space-y-8">
        <PageHeader
          title="My Profile"
          subtitle="Manage your account information"
          variant="dark"
          actions={
            <SaveButton 
              onClick={handleSave} 
              isPending={updateMutation.isPending}
              hasChanges={isDirty}
            />
          }
        />

        {(isAdminRole(user.role) || user.role === UserRole.CHECKER) && (
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <IconClipboardCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-foreground font-semibold">Verification & Testing Manual</p>
                    <p className="text-muted-foreground text-sm">Complete guide for financial verification and QA testing</p>
                  </div>
                </div>
                <Link href="/help">
                  <Button variant="default" data-testid="button-checker-manual">
                    <IconClipboardCheck className="w-4 h-4" />
                    Open Manual
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <IconUser className="w-5 h-5 text-primary" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 pb-4 border-b border-border">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <IconUser className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">{user.email}</p>
                    <p className="text-sm text-muted-foreground capitalize">{user.role}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">Email (User ID)</Label>
                  {isAdminRole(user.role) ? (
                    <Input
                      id="email"
                      type="text"
                      value="Admin"
                      disabled
                      className="bg-muted border-border text-muted-foreground cursor-not-allowed"
                      data-testid="input-profile-email"
                    />
                  ) : (
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setIsDirty(true); }}
                      placeholder="Enter your email"
                      className="bg-card border-border text-foreground"
                      data-testid="input-profile-email"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-foreground">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => { setFormData({ ...formData, firstName: e.target.value }); setIsDirty(true); }}
                    placeholder="First name"
                    className="bg-card border-border text-foreground"
                    data-testid="input-profile-firstName"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-foreground">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => { setFormData({ ...formData, lastName: e.target.value }); setIsDirty(true); }}
                    placeholder="Last name"
                    className="bg-card border-border text-foreground"
                    data-testid="input-profile-lastName"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company" className="text-foreground">Company</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => { setFormData({ ...formData, company: e.target.value }); setIsDirty(true); }}
                    placeholder="Enter your company name"
                    className="bg-card border-border text-foreground"
                    data-testid="input-profile-company"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title" className="text-foreground">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => { setFormData({ ...formData, title: e.target.value }); setIsDirty(true); }}
                    placeholder="Enter your job title"
                    className="bg-card border-border text-foreground"
                    data-testid="input-profile-title"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Monitor className="w-5 h-5 text-primary" />
                  Appearance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm font-medium">Color Mode</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: "light" as ColorMode, label: "Light", icon: Sun, preview: "bg-white border-border" },
                      { value: "auto" as ColorMode, label: "Auto", icon: Monitor, preview: "bg-gradient-to-r from-white to-zinc-800 border-border" },
                      { value: "dark" as ColorMode, label: "Dark", icon: Moon, preview: "bg-zinc-900 border-zinc-700" },
                    ] as const).map(({ value, label, icon: Icon, preview }) => {
                      const active = resolveColorMode(user?.colorMode as ColorMode | null, appearanceDefaults?.defaultColorMode as ColorMode | null) === value;
                      return (
                        <button
                          key={value}
                          data-testid={`appearance-color-${value}`}
                          onClick={() => appearanceMutation.mutate({ colorMode: value })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          <div className={`w-full h-12 rounded-lg ${preview}`} />
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">{label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground text-sm font-medium">App Font</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: "default" as FontPreference, label: "Default", family: "'Inter', sans-serif" },
                      { value: "sans" as FontPreference, label: "Sans", family: "'DM Sans', sans-serif" },
                      { value: "system" as FontPreference, label: "System", family: "-apple-system, BlinkMacSystemFont, sans-serif" },
                      { value: "dyslexic" as FontPreference, label: "Dyslexic", family: "'OpenDyslexic', 'Comic Sans MS', sans-serif" },
                    ] as const).map(({ value, label, family }) => {
                      const active = resolveFontPreference(user?.fontPreference as FontPreference | null, appearanceDefaults?.defaultFontPreference as FontPreference | null) === value;
                      return (
                        <button
                          key={value}
                          data-testid={`appearance-font-${value}`}
                          onClick={() => appearanceMutation.mutate({ fontPreference: value })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          <span className="text-2xl font-semibold" style={{ fontFamily: family }}>Aa</span>
                          <span className="text-xs font-medium">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground text-sm font-medium">Background Animation</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: "enabled" as BgAnimation, label: "Enabled", icon: Sparkles },
                      { value: "auto" as BgAnimation, label: "Auto", icon: Monitor },
                      { value: "disabled" as BgAnimation, label: "Disabled", icon: null },
                    ] as const).map(({ value, label, icon: Icon }) => {
                      const active = resolveBgAnimation(user?.bgAnimation as BgAnimation | null, appearanceDefaults?.defaultBgAnimation as BgAnimation | null) === value;
                      return (
                        <button
                          key={value}
                          data-testid={`appearance-anim-${value}`}
                          onClick={() => appearanceMutation.mutate({ bgAnimation: value })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          <div className="w-full h-10 rounded-lg bg-muted flex items-center justify-center">
                            {Icon ? <Icon className="w-5 h-5 text-muted-foreground" /> : <span className="text-xs text-muted-foreground">Off</span>}
                          </div>
                          <span className="text-xs font-medium">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {availableThemes && availableThemes.length > 1 && (
              <Card className="bg-card border-border shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <IconPalette className="w-5 h-5 text-primary" />
                    Theme Preference
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Select Theme</Label>
                    <Select
                      value={myBranding?.selectedThemeId != null ? String(myBranding.selectedThemeId) : "default"}
                      onValueChange={(v) => {
                        themeMutation.mutate(v === "default" ? null : parseInt(v));
                      }}
                      data-testid="select-user-theme"
                    >
                      <SelectTrigger data-testid="select-user-theme-trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Group Default</SelectItem>
                        {availableThemes.map(theme => (
                          <SelectItem key={theme.id} value={String(theme.id)}>
                            {theme.name}{theme.isDefault ? " (Default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose "Group Default" to use the theme assigned by your administrator, or select a specific theme.
                    </p>
                  </div>
                  {availableThemes && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {availableThemes.map(theme => {
                        const isActive = myBranding?.selectedThemeId === theme.id || 
                          (myBranding?.selectedThemeId == null && theme.isDefault);
                        return (
                          <div key={theme.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
                            <div className="flex gap-0.5">
                              {theme.colors.slice(0, 4).map((c, i) => (
                                <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c.hexCode }} />
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground">{theme.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <IconKey className="w-5 h-5 text-primary" />
                  Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword" className="text-foreground">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        placeholder="Enter current password"
                        className="bg-card border-border text-foreground pr-10"
                        data-testid="input-current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground h-auto w-auto p-0"
                        data-testid="button-toggle-current-password"
                      >
                        {showCurrentPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-foreground">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        placeholder="Enter new password"
                        className="bg-card border-border text-foreground pr-10"
                        data-testid="input-new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground h-auto w-auto p-0"
                        data-testid="button-toggle-new-password"
                      >
                        {showNewPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Min 8 characters with uppercase, lowercase, and number
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-foreground">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        placeholder="Confirm new password"
                        className="bg-card border-border text-foreground pr-10"
                        data-testid="input-confirm-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground h-auto w-auto p-0"
                        data-testid="button-toggle-confirm-password"
                      >
                        {showConfirmPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={passwordMutation.isPending || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                      data-testid="button-change-password"
                    >
                      {passwordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconKey className="w-4 h-4" />}
                      Update Password
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {!!global?.rebeccaEnabled && (
              <Card className="bg-card border-border shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <IconClipboardCheck className="w-5 h-5 text-primary" />
                    Rebecca AI Assistant
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Enable Rebecca for my account</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        When enabled, Rebecca appears in your toolbar and can answer questions about your portfolio using pre-computed metrics.
                      </p>
                    </div>
                    <Switch
                      checked={!user?.rebeccaOptOut}
                      onCheckedChange={(checked) => rebeccaToggleMutation.mutate(!checked)}
                      disabled={rebeccaToggleMutation.isPending}
                      data-testid="switch-rebecca-opt-out"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      </AnimatedPage>
    </Layout>
  );
}
