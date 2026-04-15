import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSave, IconShield } from "@/components/icons";
import { useAdminLogos, useAppBranding, useUpdateAppBranding } from "./hooks";
import defaultLogo from "@/assets/logo.png";

export default function AppIdentityTab() {
  const [selectedAppLogoId, setSelectedAppLogoId] = useState<number | null>(null);
  const [editedAppName, setEditedAppName] = useState<string | null>(null);

  const { data: adminLogos } = useAdminLogos();
  const { data: appBranding } = useAppBranding();
  const updateAppBrandingMutation = useUpdateAppBranding();

  const handleSaveAppBranding = () => {
    const logoId = selectedAppLogoId ?? appBranding?.appLogoId;
    const payload: { appLogoId?: number; appName?: string } = {};
    if (logoId) payload.appLogoId = logoId;
    if (editedAppName !== null) payload.appName = editedAppName;
    if (!payload.appLogoId && !payload.appName) return;
    updateAppBrandingMutation.mutate(payload, {
      onSuccess: () => { setSelectedAppLogoId(null); setEditedAppName(null); },
    });
  };

  const effectiveAppLogoId = selectedAppLogoId ?? appBranding?.appLogoId;
  const effectiveAppLogoUrl = selectedAppLogoId
    ? adminLogos?.find(l => l.id === selectedAppLogoId)?.url ?? appBranding?.appLogoUrl
    : appBranding?.appLogoUrl ?? "/logos/h-logo-glass.png";
  const appBrandingDirty = selectedAppLogoId !== null || (editedAppName !== null && editedAppName !== (appBranding?.appName ?? ""));

  return (
    <div className="max-w-xl">
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <IconShield className="w-4 h-4 text-muted-foreground" /> App Identity
          </CardTitle>
          <CardDescription className="label-text">
            Platform logo and name displayed in the sidebar, login page, and headers. Only super admins can change these settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-xl border-2 border-border bg-gradient-to-br from-primary/5 to-primary/10 p-2 flex items-center justify-center">
              <img
                src={effectiveAppLogoUrl}
                alt="App Logo"
                className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = defaultLogo; }}
                data-testid="img-app-logo-preview"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground text-sm">App Name</Label>
            <Input
              value={editedAppName ?? appBranding?.appName ?? ""}
              onChange={(e) => setEditedAppName(e.target.value)}
              placeholder="e.g. H+ Analytics"
              data-testid="input-app-name"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground text-sm">Select App Logo</Label>
            <div className="grid grid-cols-4 gap-2 max-h-[320px] overflow-y-auto">
              {adminLogos?.map(logo => (
                <button
                  key={logo.id}
                  type="button"
                  onClick={() => setSelectedAppLogoId(logo.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all ${
                    effectiveAppLogoId === logo.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40 bg-muted/20"
                  }`}
                  data-testid={`btn-select-app-logo-${logo.id}`}
                >
                  <div className="aspect-square w-full">
                    <img src={logo.url} alt={logo.name} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = defaultLogo; }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center" data-testid={`text-logo-name-${logo.id}`}>{logo.name}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="default"
            className="w-full"
            disabled={!appBrandingDirty || updateAppBrandingMutation.isPending}
            onClick={handleSaveAppBranding}
            data-testid="button-save-app-branding"
          >
            {updateAppBrandingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconSave className="w-4 h-4 mr-2" />}
            Save App Identity
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
