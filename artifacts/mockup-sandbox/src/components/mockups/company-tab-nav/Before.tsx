export function Before() {
  return (
    <div className="min-h-screen bg-background p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Label */}
        <div className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">
          ⚠ Current — Double Tab Bars (Problem)
        </div>

        {/* OUTER TAB BAR */}
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

        {/* DESCRIPTION CARD — separates the two tab bars */}
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

        {/* INNER TAB BAR — second row of tabs, very close to outer */}
        <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card overflow-x-auto">
          {["Company", "Fees & Financials", "Overhead", "Compensation"].map((tab) => (
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

        {/* CONTENT */}
        <div className="grid grid-cols-2 gap-5">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Identity</p>
              <p className="text-xs text-muted-foreground">The management company name and projection horizon.</p>
            </div>
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
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">5–15 years</span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Contact & Location</p>
              <p className="text-xs text-muted-foreground">Contact details and registered address.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Phone</label>
                <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">+1 (757) 555-0142</div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Email</label>
                <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">info@landb.com</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Website</label>
              <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">https://land.com</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">EIN / Tax ID</label>
                <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">92-1847356</div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Founding Year</label>
                <div className="h-9 rounded-md border border-border bg-background px-3 flex items-center text-sm text-foreground">2024</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
