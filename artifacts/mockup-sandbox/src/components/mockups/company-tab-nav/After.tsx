import { useState } from "react";

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
      >
        <span>{title}</span>
        <span className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      {open && (
        <div className="border-t border-border/60 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function After() {
  return (
    <div className="min-h-screen bg-background p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Label */}
        <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">
          ✓ Proposed Fix — Collapsible Sections
        </div>

        {/* OUTER TAB BAR — unchanged */}
        <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card overflow-x-auto">
          {["Company", "ICP Mix", "Capital Stack Discipline", "Management Co Fees", "Brands"].map((tab) => (
            <button
              key={tab}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                tab === "Company"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* DESCRIPTION CARD + ACTIONS — unchanged */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Core company identity and financial structure defaults. These apply
            organization-wide and seed the management company model. Changes do
            not affect existing properties.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium">
              <span className="text-yellow-400">✦</span> Analyst
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-foreground text-sm font-medium">
              <span className="text-xs">💾</span> Save
            </button>
          </div>
        </div>

        {/* COLLAPSIBLE SECTIONS — replaces the inner tab bar */}
        <div className="space-y-2">

          <CollapsibleSection title="Company" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground -mt-1">The management company name and projection horizon.</p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Company Name</label>
                  <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">L+B Hospitality Group</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Operations Start Date</label>
                  <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">06/01/2026</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Projection Years</label>
                  <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground justify-between">
                    <span>10</span>
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">5–15 yrs</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground -mt-1">Contact details and registered address.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Phone</label>
                    <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-xs text-foreground">+1 (757) 555-0142</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Email</label>
                    <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-xs text-foreground">info@landb.com</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Website</label>
                  <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">https://land.com</div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Fees & Financials">
            <p className="text-xs text-muted-foreground">Default management fee rates and financial assumptions.</p>
          </CollapsibleSection>

          <CollapsibleSection title="Overhead">
            <p className="text-xs text-muted-foreground">Starting annual costs for the management company's fixed and variable overhead.</p>
          </CollapsibleSection>

          <CollapsibleSection title="Compensation">
            <p className="text-xs text-muted-foreground">Salary bands and equity assumptions for management company staff.</p>
          </CollapsibleSection>

        </div>

      </div>
    </div>
  );
}
