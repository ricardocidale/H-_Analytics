import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { IconShieldCheck, IconAlertTriangle } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface AuthSettings {
  loginScreenEnabled: boolean;
}

export default function LoginSettingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";

  const { data, isLoading } = useQuery<AuthSettings>({
    queryKey: ["/api/admin/system/auth-settings"],
  });

  const mutation = useMutation({
    mutationFn: async (loginScreenEnabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/admin/system/auth-settings", { loginScreenEnabled });
      return res.json() as Promise<AuthSettings>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/admin/system/auth-settings"], updated);
      toast({
        title: updated.loginScreenEnabled ? "Login screen enabled" : "Login screen disabled",
        description: updated.loginScreenEnabled
          ? "Users will see the login form when visiting the portal."
          : "The login form is hidden. Visitors see an access-restricted message.",
      });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

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
                onCheckedChange={(checked) => mutation.mutate(checked)}
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
    </div>
  );
}
