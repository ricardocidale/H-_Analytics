import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield } from "@/components/icons/themed-icons";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";

const DEFAULT_COMPANY_NAME = "H+ Analytics";

function PrivacyContent() {
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
  const effectiveDate = "March 13, 2026";

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
              <h1 className="text-2xl font-bold font-display text-foreground">Privacy Policy</h1>
              <p className="text-sm text-muted-foreground">Effective: {effectiveDate}</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-foreground/90 space-y-6">
            <section>
              <h2 className="text-lg font-semibold font-display text-foreground mt-0">1. Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                {companyName} ("we," "our," or "us") operates a hospitality investment simulation platform (the "Service").
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">2. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed"><strong className="text-foreground">Account Information.</strong> When your administrator creates your account, we collect your name, email address, and role assignment.</p>
              <p className="text-muted-foreground leading-relaxed"><strong className="text-foreground">Usage Data.</strong> We automatically collect information about how you interact with the Service, including pages visited, features used, session duration, and device/browser information.</p>
              <p className="text-muted-foreground leading-relaxed"><strong className="text-foreground">Financial Simulation Data.</strong> You may input property assumptions, financial projections, and investment scenarios. This data is stored to provide the Service's core functionality.</p>
              <p className="text-muted-foreground leading-relaxed"><strong className="text-foreground">Communications.</strong> If you use our AI assistant or voice features, we process conversation content to provide responses. Voice data is processed by third-party providers as described below.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">3. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed">We use collected information to:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Provide, maintain, and improve the Service</li>
                <li>Authenticate your identity and manage your account</li>
                <li>Generate financial projections, research, and analysis</li>
                <li>Send administrative notifications relevant to your use of the Service</li>
                <li>Monitor and analyze usage patterns to improve performance and user experience</li>
                <li>Detect, prevent, and address technical issues or security threats</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">4. Third-Party Services</h2>
              <p className="text-muted-foreground leading-relaxed">We integrate with third-party services to provide functionality. These services may process your data under their own privacy policies:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li><strong className="text-foreground">AI Providers</strong> (Anthropic, Google, OpenAI) — for research generation and conversational AI</li>
                <li><strong className="text-foreground">Sentry</strong> — for error tracking and performance monitoring</li>
                <li><strong className="text-foreground">PostHog</strong> — for product analytics</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">We do not sell your personal information to third parties.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">5. Data Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement industry-standard security measures including encrypted connections (TLS), secure session management,
                password hashing, and role-based access controls. Financial simulation data is stored in encrypted databases.
                While we strive to protect your information, no method of electronic transmission or storage is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">6. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your account information and simulation data for as long as your account is active or as needed to provide the Service.
                Session data is automatically purged on a periodic basis. You may request deletion of your account and associated data by contacting your administrator.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">7. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed">Depending on your jurisdiction, you may have the right to:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Object to or restrict certain processing activities</li>
                <li>Data portability</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">To exercise these rights, contact your organization's administrator.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">8. Cookies and Session Management</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use session cookies to authenticate your identity and maintain your login state. These are essential for the Service to function
                and cannot be disabled. We do not use advertising or third-party tracking cookies.
                For full details on the cookies we use, please see our{" "}
                <Link href="/cookies" className="text-primary underline underline-offset-2 hover:text-primary/80">Cookie Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">9. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">10. Changes to This Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify users of material changes through the Service.
                Your continued use of the Service after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">11. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions about this Privacy Policy or our data practices, contact your organization's administrator
                or reach out to us through the Service's support channels.
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

export default function PrivacyPolicy() {
  const { user } = useAuth();

  if (user) {
    return (
      <Layout>
        <PrivacyContent />
      </Layout>
    );
  }

  return (
    <div className="min-h-svh bg-muted">
      <PrivacyContent />
    </div>
  );
}
