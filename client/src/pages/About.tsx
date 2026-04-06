import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "@/components/icons/themed-icons";
import { IconInfo, IconZap, IconSettings, IconCheckCircle } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import { APP_BRAND_NAME, APP_FULL_BRAND, BRAND_ACCENT_HEX } from "@shared/constants";
import defaultLogo from "@/assets/logo.png";

const APP_VERSION = "2.0.0";

function AboutContent() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
      {user && (
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" data-testid="button-back-about">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
        </div>
      )}

      <Card className="border-primary/10 shadow-lg" data-testid="about-card">
        <CardContent className="p-6 sm:p-10 space-y-8">
          <div className="flex items-start gap-4">
            <img src={defaultLogo} alt={APP_BRAND_NAME} className="w-40 h-40 object-contain rounded-xl" />
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-about-title">
                {APP_BRAND_NAME} App
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-about-brand">
                {APP_FULL_BRAND}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid="text-about-version">
                  v{APP_VERSION}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/20 text-primary">
                  Production
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          <section>
            <div className="flex items-center gap-2 mb-3">
              <IconInfo className="w-5 h-5 text-primary" />
              <h2 className="text-base font-display font-semibold text-foreground">About This Application</h2>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">{APP_BRAND_NAME} App</strong> is a GAAP-compliant financial analytics platform
                purpose-built for boutique hotel portfolio management. Powered by{" "}
                <span style={{ color: BRAND_ACCENT_HEX }} className="font-medium">Norfolk AI</span>,
                the platform provides institutional-grade financial modeling, automated verification,
                and AI-driven market intelligence for hotel operators, investors, partners, and financial auditors.
              </p>
              <p>
                The platform models entire hotel portfolios across 30-year projection horizons — from acquisition
                through operations, refinancing, and exit — generating GAAP-compliant pro formas, balance sheets,
                cash flow statements, and investor-ready reports.
              </p>
              <p>
                An integrated verification engine runs 1,330+ automated tests against every financial model,
                producing formal audit opinions (Unqualified, Qualified, Adverse, or Disclaimer) following
                established auditing standards.
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <IconZap className="w-5 h-5 text-primary" />
              <h2 className="text-base font-display font-semibold text-foreground">Key Capabilities</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: "Financial Modeling", desc: "30-year projections with IRR, equity multiples, DSCR, cap rates, and waterfall distributions" },
                { title: "GAAP Compliance", desc: "ASC 606 revenue recognition, USALI-aligned expense classification, and audit-grade reporting" },
                { title: "AI Research Intelligence", desc: "Market benchmarks, comparable analysis, and assumption guidance powered by Norfolk AI" },
                { title: "Automated Verification", desc: "1,330+ tests producing formal audit opinions across all financial statements" },
                { title: "Portfolio Analytics", desc: "Executive dashboard with KPI tracking, scenario analysis, and sensitivity modeling" },
                { title: "Rebecca AI Assistant", desc: "Contextual AI chatbot for portfolio questions, financial explanations, and research insights" },
              ].map((item) => (
                <div key={item.title} className="p-3 rounded-lg bg-muted/30 border border-border/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <IconCheckCircle className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section data-testid="about-tech-stack">
            <div className="flex items-center gap-2 mb-3">
              <IconSettings className="w-5 h-5 text-primary" />
              <h2 className="text-base font-display font-semibold text-foreground">Technology Stack</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Built with modern, enterprise-grade technologies selected for reliability, performance, and security.
            </p>
            <div className="space-y-4">
              {[
                {
                  category: "Frontend",
                  items: [
                    { name: "React 18", detail: "Component-based UI framework with concurrent rendering" },
                    { name: "TypeScript", detail: "Strict type-safe development across the entire codebase" },
                    { name: "Tailwind CSS", detail: "Utility-first styling with custom design system" },
                    { name: "Vite", detail: "Next-generation build tool with hot module replacement" },
                    { name: "TanStack Query", detail: "Server-state management with automatic caching" },
                    { name: "Framer Motion", detail: "Production-grade animations and transitions" },
                    { name: "Recharts", detail: "Composable charting library for financial visualizations" },
                  ],
                },
                {
                  category: "Backend",
                  items: [
                    { name: "Node.js", detail: "JavaScript runtime for server-side execution" },
                    { name: "Express", detail: "HTTP server framework with middleware architecture" },
                    { name: "PostgreSQL", detail: "Relational database for transactional data persistence" },
                    { name: "Drizzle ORM", detail: "Type-safe database queries and schema management" },
                    { name: "Zod", detail: "Runtime schema validation for API inputs and data integrity" },
                  ],
                },
                {
                  category: "AI & Intelligence",
                  items: [
                    { name: "Norfolk AI Engine", detail: "Proprietary research orchestration and ICP-driven analysis" },
                    { name: "Google Gemini", detail: "Large language model for portfolio analysis and chat" },
                    { name: "Pinecone", detail: "Vector database for RAG retrieval across 5 knowledge namespaces" },
                    { name: "Perplexity", detail: "Grounded web search for real-time market intelligence" },
                  ],
                },
                {
                  category: "Infrastructure",
                  items: [
                    { name: "Replit", detail: "Cloud development and deployment platform" },
                    { name: "Resend", detail: "Transactional email delivery for reports and notifications" },
                    { name: "Stripe", detail: "Payment processing for subscription management" },
                  ],
                },
              ].map((group) => (
                <div key={group.category}>
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                    {group.category}
                  </h3>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div key={item.name} className="flex items-baseline gap-2 text-xs">
                        <span className="font-medium text-foreground whitespace-nowrap">{item.name}</span>
                        <span className="text-muted-foreground/40">—</span>
                        <span className="text-muted-foreground">{item.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <footer className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Norfolk AI. All rights reserved.
            </p>
            <p className="text-[11px] text-muted-foreground/50">
              {APP_FULL_BRAND} &middot; v{APP_VERSION}
            </p>
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}

export default function About() {
  const { user } = useAuth();

  if (!user) {
    return <AboutContent />;
  }

  return (
    <Layout>
      <AboutContent />
    </Layout>
  );
}
