import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconShieldCheck, IconAlertTriangle, IconMessageSquareText, IconTerminal, IconInfo } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const MOTD_MAX_LENGTH = 280;

interface AuthSettings {
  loginScreenEnabled: boolean;
  motd: { enabled: boolean; text: string };
  autoLoginEnabled: boolean;
}

export default function LoginSettingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";

  const { data, isLoading } = useQuery<AuthSettings>({
    queryKey: ["/api/admin/system/auth-settings"],
  });

  const [motdText, setMotdText] = useState("");

  useEffect(() => {
    if (data?.motd?.text !== undefined) {
      setMotdText(data.motd.text);
    }
  }, [data?.motd?.text]);

  const mutation = useMutation({
    mutationFn: async (update: Partial<{ loginScreenEnabled: boolean; motdEnabled: boolean; motdText: string }>) => {
      const res = await apiRequest("PATCH", "/api/admin/system/auth-settings", update);
      return res.json() as Promise<AuthSettings>;
    },
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(["/api/admin/system/auth-settings"], updated);
      if (variables.loginScreenEnabled !== undefined) {
        toast({
          title: updated.loginScreenEnabled ? "Login screen enabled" : "Login screen disabled",
          description: updated.loginScreenEnabled
            ? "Users will see the login form when visiting the portal."
            : "The login form is hidden. Visitors see an access-restricted message.",
        });
      } else if (variables.motdEnabled !== undefined) {
        toast({
          title: updated.motd.enabled ? "Message of the day enabled" : "Message of the day disabled",
        });
      } else if (variables.motdText !== undefined) {
        toast({ title: "Message saved" });
      }
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const motdTextChanged = motdText !== (data?.motd?.text ?? "");

  return (
    <div className="space-y-6">
      {!isSuperAdmin && (
        <Alert>
          <IconAlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Only super-administrators can change login settings.
          </AlertDescription>
        </Alert>
      )}

      {/* Login screen toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <IconShieldCheck className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Login Screen</CardTitle>
              <CardDescription>
                Control whether the login form is shown to visitors.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-1 pr-4">
              <Label htmlFor="login-screen-toggle" className="text-sm font-medium">
                Login screen
              </Label>
              <p className="text-xs text-muted-foreground">
                When off, visitors see an "access restricted" notice instead of
                the login form. Existing sessions stay active.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!isLoading && data !== undefined && (
                <Badge variant={data.loginScreenEnabled ? "default" : "secondary"}>
                  {data.loginScreenEnabled ? "On" : "Off"}
                </Badge>
              )}
              <Switch
                id="login-screen-toggle"
                checked={data?.loginScreenEnabled ?? true}
                disabled={!isSuperAdmin || isLoading || mutation.isPending}
                onCheckedChange={(checked) => mutation.mutate({ loginScreenEnabled: checked })}
                data-testid="toggle-login-screen"
              />
            </div>
          </div>

          {data && !data.loginScreenEnabled && (
            <Alert variant="destructive">
              <IconAlertTriangle className="w-4 h-4" />
              <AlertDescription>
                The login screen is currently <strong>off</strong>. New users
                cannot sign in. Turn it back on to restore normal access.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Message of the day */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <IconMessageSquareText className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Message of the Day</CardTitle>
              <CardDescription>
                Show a short message on the login screen for all visitors (desktop only, right panel).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-1 pr-4">
              <Label htmlFor="motd-toggle" className="text-sm font-medium">
                Show message
              </Label>
              <p className="text-xs text-muted-foreground">
                When on, the message appears on the right panel of the login screen.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!isLoading && data !== undefined && (
                <Badge variant={data.motd?.enabled ? "default" : "secondary"}>
                  {data.motd?.enabled ? "On" : "Off"}
                </Badge>
              )}
              <Switch
                id="motd-toggle"
                checked={data?.motd?.enabled ?? false}
                disabled={!isSuperAdmin || isLoading || mutation.isPending}
                onCheckedChange={(checked) => mutation.mutate({ motdEnabled: checked })}
                data-testid="toggle-motd"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motd-text" className="text-sm font-medium">
              Message
            </Label>
            <Textarea
              id="motd-text"
              value={motdText}
              onChange={(e) => setMotdText(e.target.value.slice(0, MOTD_MAX_LENGTH))}
              placeholder="e.g. The portal will be down for maintenance on Saturday from 2–4 AM EST."
              disabled={!isSuperAdmin || mutation.isPending}
              rows={3}
              className="resize-none"
              data-testid="input-motd-text"
            />
            <div className="flex items-center justify-between">
              <p className={`text-xs ${motdText.length >= MOTD_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                {motdText.length}/{MOTD_MAX_LENGTH}
              </p>
              <Button
                size="sm"
                onClick={() => mutation.mutate({ motdText })}
                disabled={!isSuperAdmin || mutation.isPending || !motdTextChanged}
              >
                Save message
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
