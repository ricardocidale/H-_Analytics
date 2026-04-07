import { APP_BRAND_NAME, BRAND_ACCENT_HEX, BRAND_ACCENT_PREFIX } from "@shared/constants";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconEye, IconEyeOff } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import bgImage from "@/assets/hotel-party.jpg";
import SpinningLogo3D from "@/components/SpinningLogo3D";
import { applyThemeColors, resetThemeColors } from "@/lib/theme";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  no_account: "No account found for this Google email. Contact your administrator for access.",
  google_failed: "Google sign-in failed. Please try again.",
  google_unavailable: "Google sign-in is temporarily unavailable.",
  invalid_state: "Sign-in session expired. Please try again.",
  no_email: "Could not retrieve email from Google. Please try again.",
  email_not_verified: "Your Google email is not verified. Please verify it and try again.",
  google_id_mismatch: "This Google account doesn't match the one previously linked. Contact your administrator.",
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error && GOOGLE_ERROR_MESSAGES[error]) {
      toast({ title: "Sign-In Error", description: GOOGLE_ERROR_MESSAGES[error], variant: "destructive" });
      window.history.replaceState({}, "", "/login");
    }
  }, [toast]);

  useEffect(() => {
    const CACHE_KEY = "h-analytics:public-theme";

    resetThemeColors();

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { themeColors } = JSON.parse(cached);
        if (themeColors?.length) applyThemeColors(themeColors);
      } catch { /* ignore */ }
    }

    fetch("/api/public/theme")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.themeColors?.length) {
          applyThemeColors(data.themeColors);
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        }
      })
      .catch(() => { /* ignore */ });

    return () => { resetThemeColors(); };
  }, []);

  const handleAdminLogin = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Admin login failed");
      }
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-5 md:p-10 overflow-auto"
      style={{ background: "linear-gradient(145deg, hsl(var(--muted)) 0%, hsl(var(--border)) 100%)" }}
    >
      <div className="w-full max-w-sm md:max-w-[920px] mx-auto flex flex-col gap-5">

        {/* ── Card ──────────────────────────────────────────────── */}
        <div
          className="w-full overflow-hidden rounded-2xl border border-border/60 bg-card md:grid md:grid-cols-2"
          style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.06)" }}
        >

          {/* ── Left: form ───────────────────────────────────── */}
          <div className="bg-card flex flex-col">
            {/* Accent bar */}
            <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))" }} />

            <form
              onSubmit={handleSubmit}
              className="flex items-center justify-center p-8 md:p-12"
            >
              <div className="flex flex-col gap-5 w-full max-w-sm">

                {/* Logo + heading */}
                <div className="flex flex-col items-center text-center gap-2 mb-1">
                  <div style={{ filter: "drop-shadow(0 0 14px rgba(var(--primary-rgb),0.35))" }}>
                    <SpinningLogo3D size={204} onClick={handleAdminLogin} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold font-display tracking-tight" data-testid="text-welcome">
                      Welcome back
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Sign in to your {APP_BRAND_NAME} portal
                    </p>
                  </div>
                </div>

                {/* Email */}
                <div className="grid gap-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email or Username
                  </Label>
                  <Input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="bg-muted/40 border-border/80 focus:bg-card transition-colors"
                    data-testid="input-email"
                  />
                </div>

                {/* Password */}
                <div className="grid gap-1.5">
                  <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="pr-10 bg-muted/40 border-border/80 focus:bg-card transition-colors"
                      data-testid="input-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors h-auto w-auto p-0"
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 font-medium"
                  data-testid="button-login"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>

                {/* Divider */}
                <div className="relative text-center text-xs">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <span className="relative bg-card px-3 text-muted-foreground">or continue with</span>
                </div>

                {/* Google */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 border-border/80 bg-muted/30 hover:bg-muted/60 transition-colors"
                  onClick={() => { window.location.href = "/api/auth/google"; }}
                  disabled={isLoading}
                  data-testid="button-google-login"
                >
                  <GoogleIcon className="w-4 h-4 mr-2 shrink-0" />
                  Sign in with Google
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Contact your administrator if you need access
                </p>
              </div>
            </form>
          </div>

          {/* ── Right: photo panel ───────────────────── */}
          <div className="relative hidden md:flex flex-col items-center justify-end overflow-hidden">
            {/* Photo */}
            <img
              src={bgImage}
              alt="Boutique hotel event space"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Dark gradient veil so brand text at bottom stays legible */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)" }}
            />
            {/* Brand text */}
            <div className="relative z-10 text-center px-8 pb-10">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/50 mb-2 font-medium">
                Hospitality Intelligence
              </p>
              <h2 className="text-2xl font-display font-bold text-white/90 leading-snug">
                <span style={{ color: BRAND_ACCENT_HEX }}>{BRAND_ACCENT_PREFIX}</span>{APP_BRAND_NAME.slice(BRAND_ACCENT_PREFIX.length)}
              </h2>
              <p className="text-xs text-white/50 mt-2 leading-relaxed max-w-[220px] mx-auto">
                Dual-entity GAAP modelling and investment simulation for the modern portfolio.
              </p>
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] text-muted-foreground/70">
            <a href="/privacy" className="hover:text-foreground transition-colors underline underline-offset-2">Privacy Policy</a>
            {" · "}
            <a href="/terms" className="hover:text-foreground transition-colors underline underline-offset-2">Terms of Service</a>
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 font-medium">Powered by</span>
            <img src="/logos/norfolk-ai-blue.png" alt="Norfolk AI" className="w-4 h-4 opacity-50" />
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground/50">Norfolk AI</span>
          </div>
        </div>

      </div>
    </div>
  );
}
