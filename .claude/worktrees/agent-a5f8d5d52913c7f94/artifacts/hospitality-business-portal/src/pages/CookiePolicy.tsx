import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield } from "@/components/icons/themed-icons";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";

const DEFAULT_COMPANY_NAME = "H+ Analytics";

function CookieContent() {
  const { user } = useAuth();
  const { data: branding } = useQuery({
    queryKey: ["my-branding"],
    queryFn: async () => {
      const res = await fetch("/api/my-branding", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
  });
  const companyName = branding?.companyName || DEFAULT_COMPANY_NAME;
  const effectiveDate = "April 14, 2026";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
      <div className="mb-6">
        <Link href="/login">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </Link>
      </div>

      <Card className="border-primary/10 shadow-lg">
        <CardContent className="p-6 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-foreground" data-testid="text-cookie-policy-title">Cookie Policy</h1>
              <p className="text-sm text-muted-foreground">Effective: {effectiveDate}</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-foreground/90 space-y-6">
            <section>
              <h2 className="text-lg font-semibold font-display text-foreground mt-0">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                This Cookie Policy explains how {companyName} ("we," "our," or "us") uses cookies and similar technologies
                when you access and use our hospitality investment simulation platform (the "Service"). This policy should be
                read alongside our{" "}
                <Link href="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">Privacy Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">2. What Are Cookies?</h2>
              <p className="text-muted-foreground leading-relaxed">
                Cookies are small text files stored on your device when you visit a website. They help the site remember
                your preferences, keep you signed in, and understand how you use the service. Cookies can be "session" cookies
                (deleted when you close your browser) or "persistent" cookies (remain until they expire or you delete them).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">3. Cookies We Use</h2>
              <p className="text-muted-foreground leading-relaxed">We use the following categories of cookies:</p>

              <div className="mt-3 space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground text-sm mb-1">Essential / Strictly Necessary</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    These cookies are required for the Service to function. They handle authentication, session management,
                    and security. Without them you cannot log in or use the platform.
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1 mt-2 text-sm">
                    <li><strong className="text-foreground">session_id</strong> — Maintains your authenticated session. HTTP-only, secure, same-site. Expires after 7 days.</li>
                  </ul>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground text-sm mb-1">Functional</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    These cookies remember your preferences so the Service can provide a personalized experience.
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1 mt-2 text-sm">
                    <li><strong className="text-foreground">Theme / display preferences</strong> — Stores your selected color mode, font preference, and background animation settings.</li>
                    <li><strong className="text-foreground">Sidebar state</strong> — Remembers whether the navigation sidebar is open or collapsed.</li>
                  </ul>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground text-sm mb-1">Analytics</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    We may use analytics tools to understand how the Service is used so we can improve it. These tools may set their own cookies.
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1 mt-2 text-sm">
                    <li><strong className="text-foreground">PostHog</strong> — Product analytics to understand feature usage and improve the user experience.</li>
                    <li><strong className="text-foreground">Sentry</strong> — Error tracking and performance monitoring to identify and fix issues.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">4. Cookies We Do Not Use</h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not use advertising cookies, cross-site tracking cookies, or social media cookies.
                We do not sell cookie data to third parties. We do not engage in behavioral advertising or retargeting.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">5. Third-Party Cookies</h2>
              <p className="text-muted-foreground leading-relaxed">
                Some third-party services integrated into the platform may set their own cookies. These services operate
                under their own cookie and privacy policies:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li><strong className="text-foreground">Google</strong> — If you sign in via Google OAuth, Google may set authentication-related cookies.</li>
                <li><strong className="text-foreground">PostHog</strong> — Sets analytics cookies to track anonymous usage patterns.</li>
                <li><strong className="text-foreground">Sentry</strong> — May set cookies for error tracking and session replay.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">6. Managing Cookies</h2>
              <p className="text-muted-foreground leading-relaxed">
                Most web browsers allow you to control cookies through their settings. You can typically:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>View what cookies are stored on your device</li>
                <li>Delete individual or all cookies</li>
                <li>Block cookies from specific or all sites</li>
                <li>Set your browser to notify you when a cookie is set</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-2">
                Please note that disabling essential cookies will prevent you from using the Service, as they are required
                for authentication and session management.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">7. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                Session cookies expire when you close your browser or after 7 days of inactivity. Persistent cookies
                related to preferences are stored until you clear them or change your settings. Analytics data collected
                via cookies is retained according to the respective provider's data retention policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">8. Updates to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Cookie Policy from time to time to reflect changes in technology, regulation, or our
                practices. We will notify users of material changes through the Service. The "Effective" date at the top
                of this page indicates when the policy was last revised.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">9. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions about our use of cookies, please contact your organization's administrator
                or reach out to us through the Service's support channels. For broader privacy inquiries, refer to
                our{" "}
                <Link href="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">Privacy Policy</Link>.
              </p>
            </section>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground/60 mt-6">
        &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
      </p>
    </div>
  );
}

export default function CookiePolicy() {
  const { user } = useAuth();

  if (user) {
    return (
      <Layout>
        <CookieContent />
      </Layout>
    );
  }

  return (
    <div className="min-h-svh bg-muted">
      <CookieContent />
    </div>
  );
}
