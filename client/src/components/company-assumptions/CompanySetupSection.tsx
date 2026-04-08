import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { IconPhone, IconGlobe, IconHash, IconCalendar, IconProperties, IconMail, IconMapPin, IconPercent } from "@/components/icons";
import defaultLogo from "@/assets/logo.png";
import { PROJECTION_YEARS } from "@/lib/constants";
import { useGeoSelect, GEO_CLEAR_VALUE } from "@/hooks/use-geo";
import LogoSelector from "@/components/admin/LogoSelector";
import type { CompanySetupSectionProps } from "./types";

export default function CompanySetupSection({ formData, onChange, global, isAdmin, researchValues }: CompanySetupSectionProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });
  const geo = useGeoSelect({
    countryName: formData.companyCountry ?? global.companyCountry ?? "",
    stateName: formData.companyStateProvince ?? global.companyStateProvince ?? "",
    onCountryChange: (v) => onChange("companyCountry", v),
    onStateChange: (v) => onChange("companyStateProvince", v),
    onCityChange: (v) => onChange("companyCity", v),
  });

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative space-y-6">
        <div>
          <h3 className="text-lg font-display text-foreground flex items-center">
            Company Setup
            <InfoTooltip text="Configure the management company identity, contact info, location, and projection horizon." />
          </h3>
          <p className="text-muted-foreground text-sm label-text">Configure the management company details and when it starts operations</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="flex flex-col gap-2">
            <Label className="flex items-center text-foreground label-text">
              Company Logo
              <InfoTooltip text="The company logo displayed in the navigation. Upload logos via Admin > Logos." />
            </Label>
            <LogoSelector
              label=""
              value={formData.companyLogoId ?? global.companyLogoId ?? null}
              onChange={(logoId) => onChange("companyLogoId", logoId)}
              showNone={true}
              emptyLabel="Default Logo"
              helpText="Select from Logo Portfolio"
              testId="select-company-logo"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="flex items-center text-foreground label-text">
              Company Name
              <InfoTooltip text="The name of the hospitality management company." />
            </Label>
            <Input
              type="text"
              value={formData.companyName ?? global.companyName ?? "Hospitality Business"}
              onChange={(e) => onChange("companyName", e.target.value)}
              disabled={!isAdmin}
              className={`max-w-64 border-border text-foreground ${!isAdmin ? 'bg-muted cursor-not-allowed opacity-60' : 'bg-card'}`}
              data-testid="input-company-name"
            />
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Only administrators can change the company name</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label className="flex items-center text-foreground label-text">
              Operations Start Date
              <InfoTooltip text="The date when the management company begins operations, starts paying salaries, and incurs overhead costs" />
            </Label>
            <Input
              type="date"
              value={formData.companyOpsStartDate ?? global.companyOpsStartDate ?? "2026-06-01"}
              onChange={(e) => onChange("companyOpsStartDate", e.target.value)}
              className="max-w-40 bg-card border-border text-foreground"
              data-testid="input-company-ops-start-date"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="flex items-center text-foreground label-text">
              Projection Years
              <InfoTooltip text="Number of years to project financial statements. Affects all charts, tables, and verification checks." />
            </Label>
            <Input
              type="number"
              value={formData.projectionYears ?? global.projectionYears ?? PROJECTION_YEARS}
              onChange={(e) => onChange("projectionYears", Math.max(1, Math.min(30, parseInt(e.target.value) || PROJECTION_YEARS)))}
              min={1}
              max={30}
              className="max-w-24 bg-card border-border text-foreground"
              data-testid="input-projection-years"
            />
          </div>
        </div>

        <Card className="bg-card border border-border/80 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <IconPercent className="w-4 h-4 text-muted-foreground" /> Inflation rate used by Company
            </CardTitle>
            <CardDescription className="label-text">Specific inflation rate for management company overhead calculations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-md space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Company Inflation Rate <InfoTooltip text="Overrides the global inflation rate for management company overhead cost escalation. If left empty, falls back to the global inflation rate. Three-tier cascade: property → company → global." /></>}
                  badgeProps={{ value: researchValues.companyInflationRate?.display, sourceType: "industry", sourceName: "CPI / Fed Reserve", "data-testid": "badge-company-inflation" }}
                  onApplyValue={() => researchValues.companyInflationRate && onChange("companyInflationRate", researchValues.companyInflationRate.mid / 100)}
                  guidanceContext={gc("companyInflationRate", "Company Inflation Rate")}
                  className="text-foreground label-text"
                />
                <span className="text-sm font-mono text-primary">
                  {(formData.companyInflationRate ?? global.companyInflationRate) != null
                    ? `${(((formData.companyInflationRate ?? global.companyInflationRate) as number) * 100).toFixed(1)}%`
                    : "Default (Global)"}
                </span>
              </div>
              <Slider
                value={[((formData.companyInflationRate ?? global.companyInflationRate ?? 0.03) as number) * 100]}
                onValueChange={([v]) => onChange("companyInflationRate", v / 100)}
                min={0}
                max={10}
                step={0.1}
                data-testid="slider-company-inflation"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>10%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Falls back to global inflation if not set. Used for escalating management company overhead costs annually.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card className="bg-card border border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <IconPhone className="w-4 h-4 text-muted-foreground" /> Contact Information
                </CardTitle>
                <CardDescription className="label-text">Official contact details for reports and correspondence</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="label-text text-foreground flex items-center gap-2"><IconMail className="w-3 h-3" /> Email</Label>
                    <Input
                      value={formData.companyEmail ?? global.companyEmail ?? ""}
                      onChange={(e) => onChange("companyEmail", e.target.value)}
                      placeholder="contact@company.com"
                      className="bg-card"
                      data-testid="input-company-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="label-text text-foreground flex items-center gap-2"><IconPhone className="w-3 h-3" /> Phone</Label>
                    <Input
                      value={formData.companyPhone ?? global.companyPhone ?? ""}
                      onChange={(e) => onChange("companyPhone", e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="bg-card"
                      data-testid="input-company-phone"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="label-text text-foreground flex items-center gap-2"><IconGlobe className="w-3 h-3" /> Website</Label>
                    <Input
                      value={formData.companyWebsite ?? global.companyWebsite ?? ""}
                      onChange={(e) => onChange("companyWebsite", e.target.value)}
                      placeholder="https://www.company.com"
                      className="bg-card"
                      data-testid="input-company-website"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <IconHash className="w-4 h-4 text-muted-foreground" /> Financial & Regulatory
                </CardTitle>
                <CardDescription className="label-text">Corporate identification and fiscal settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="label-text text-foreground flex items-center gap-2">Tax ID / EIN</Label>
                    <Input
                      value={formData.companyEin ?? global.companyEin ?? ""}
                      onChange={(e) => onChange("companyEin", e.target.value)}
                      placeholder="XX-XXXXXXX"
                      className="bg-card"
                      data-testid="input-company-ein"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="label-text text-foreground flex items-center gap-2"><IconCalendar className="w-3 h-3" /> Founding Year</Label>
                    <Input
                      type="number"
                      value={formData.companyFoundingYear ?? global.companyFoundingYear ?? ""}
                      onChange={(e) => onChange("companyFoundingYear", e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="2020"
                      className="bg-card"
                      data-testid="input-company-founding-year"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <IconMapPin className="w-4 h-4 text-muted-foreground" /> Headquarters Location
              </CardTitle>
              <CardDescription className="label-text">Primary business address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label className="label-text text-foreground">Street Address</Label>
                  <Input
                    value={formData.companyStreetAddress ?? global.companyStreetAddress ?? ""}
                    onChange={(e) => onChange("companyStreetAddress", e.target.value)}
                    placeholder="123 Business Way"
                    className="bg-card"
                    data-testid="input-company-street"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="label-text text-foreground">Country</Label>
                    <Select value={geo.countryCode || GEO_CLEAR_VALUE} onValueChange={geo.handleCountryChange}>
                      <SelectTrigger className="bg-card" data-testid="select-company-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        <SelectItem value={GEO_CLEAR_VALUE} className="text-muted-foreground">None</SelectItem>
                        {geo.countries.map((c) => (
                          <SelectItem key={c.isoCode} value={c.isoCode}>
                            {c.flag} {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="label-text text-foreground">State / Province</Label>
                    <Select value={geo.stateCode || GEO_CLEAR_VALUE} onValueChange={geo.handleStateChange} disabled={!geo.countryCode}>
                      <SelectTrigger className="bg-card" data-testid="select-company-state">
                        <SelectValue placeholder={geo.countryCode ? "Select state" : "Select country first"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        <SelectItem value={GEO_CLEAR_VALUE} className="text-muted-foreground">None</SelectItem>
                        {geo.states.map((s) => (
                          <SelectItem key={s.isoCode} value={s.isoCode}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="label-text text-foreground">City</Label>
                    <Select value={(formData.companyCity ?? global.companyCity) || GEO_CLEAR_VALUE} onValueChange={geo.handleCityChange} disabled={!geo.stateCode}>
                      <SelectTrigger className="bg-card" data-testid="select-company-city">
                        <SelectValue placeholder={geo.stateCode ? "Select city" : "Select state first"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        <SelectItem value={GEO_CLEAR_VALUE} className="text-muted-foreground">None</SelectItem>
                        {geo.cities.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="label-text text-foreground">Zip / Postal Code</Label>
                    <Input
                      value={formData.companyZipPostalCode ?? global.companyZipPostalCode ?? ""}
                      onChange={(e) => onChange("companyZipPostalCode", e.target.value)}
                      placeholder="94105"
                      className="bg-card"
                      data-testid="input-company-zip"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
