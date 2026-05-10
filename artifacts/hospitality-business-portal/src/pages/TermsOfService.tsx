import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Scale } from "@/components/icons/themed-icons";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";

const DEFAULT_COMPANY_NAME = "H+ Analysis";

function TermsContent() {
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
              <Scale className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-foreground">Terms of Service</h1>
              <p className="text-sm text-muted-foreground">Effective: {effectiveDate}</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-foreground/90 space-y-6">
            <section>
              <h2 className="text-lg font-semibold font-display text-foreground mt-0">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using the {companyName} simulation platform (the "Service"), you agree to be bound by these Terms of Service ("Terms").
                If you do not agree to these Terms, you may not access or use the Service. Access is granted by your organization's administrator.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">2. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service provides hospitality investment simulation, financial modeling, market research, and portfolio analysis tools.
                The Service generates projections based on user-provided assumptions and publicly available data. All outputs are simulations
                intended for informational and planning purposes only.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">3. No Financial Advice</h2>
              <p className="text-muted-foreground leading-relaxed">
                <strong className="text-foreground">The Service does not constitute financial, investment, legal, or tax advice.</strong> All
                projections, analyses, research outputs, and AI-generated content are simulations based on assumptions you provide.
                Actual results will vary. You should consult qualified professionals before making any investment decisions.
                We make no representations or warranties regarding the accuracy, completeness, or reliability of any projections or analyses.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">4. User Accounts and Access</h2>
              <p className="text-muted-foreground leading-relaxed">
                Accounts are created and managed by your organization's administrator. You are responsible for maintaining
                the confidentiality of your login credentials and for all activities that occur under your account.
                You must immediately notify your administrator of any unauthorized use of your account.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Access levels (administrator, user) determine which features and data are available to you.
                Your administrator controls your role assignment.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">5. Acceptable Use</h2>
              <p className="text-muted-foreground leading-relaxed">You agree not to:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Share your login credentials with others</li>
                <li>Attempt to access features or data beyond your assigned role</li>
                <li>Use the Service for any unlawful purpose</li>
                <li>Attempt to reverse-engineer, decompile, or extract source code from the Service</li>
                <li>Introduce malware, viruses, or other harmful code</li>
                <li>Use automated tools to scrape or extract data from the Service</li>
                <li>Interfere with or disrupt the Service's infrastructure</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">6. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service, including its design, features, algorithms, and code, is the intellectual property of {companyName} and its licensors.
                You retain ownership of the data you input into the Service. We claim no ownership over your financial assumptions,
                property data, or other content you provide.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Research and analysis generated by the Service using AI and third-party data sources are provided as part of the Service
                and may be used by you for internal business purposes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">7. AI-Generated Content</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service uses artificial intelligence models from third-party providers to generate research, analysis, and conversational responses.
                AI-generated content may contain inaccuracies, be incomplete, or reflect biases present in training data.
                You should independently verify AI-generated content before relying on it for decision-making.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">8. Data and Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your use of the Service is also governed by our{" "}
                <Link href="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">Privacy Policy</Link>,
                which describes how we collect, use, and protect your information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">9. Service Availability</h2>
              <p className="text-muted-foreground leading-relaxed">
                We strive to maintain the Service's availability but do not guarantee uninterrupted access. The Service may be temporarily
                unavailable due to maintenance, updates, or circumstances beyond our control. We are not liable for any losses
                resulting from service interruptions.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">10. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                To the maximum extent permitted by applicable law, {companyName} and its affiliates, officers, employees, and agents
                shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues,
                whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Your use or inability to use the Service</li>
                <li>Any decisions made based on projections or analyses from the Service</li>
                <li>Unauthorized access to or alteration of your data</li>
                <li>Any third-party conduct on the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">11. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to indemnify and hold harmless {companyName} from any claims, damages, losses, or expenses (including reasonable
                attorney's fees) arising from your use of the Service or violation of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">12. Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your organization's administrator may terminate your access at any time. We may also suspend or terminate access
                for violations of these Terms. Upon termination, your right to use the Service ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">13. Changes to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify these Terms at any time. Material changes will be communicated through the Service.
                Continued use after changes constitutes acceptance of the modified Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">14. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the State of New York,
                without regard to its conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold font-display text-foreground">15. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions regarding these Terms, contact your organization's administrator
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

export default function TermsOfService() {
  const { user } = useAuth();

  if (user) {
    return (
      <Layout>
        <TermsContent />
      </Layout>
    );
  }

  return (
    <div className="min-h-svh bg-muted">
      <TermsContent />
    </div>
  );
}
