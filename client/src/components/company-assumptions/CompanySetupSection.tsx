import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CityCombobox } from "@/components/ui/city-combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconPhone, IconGlobe, IconHash, IconCalendar, IconMail, IconMapPin, IconTarget } from "@/components/icons";
import { Link } from "wouter";

import { useGeoSelect, GEO_CLEAR_VALUE } from "@/hooks/use-geo";
import LogoSelector from "@/components/admin/LogoSelector";
import type { CompanySetupSectionProps } from "./types";

export default function CompanySetupSection({ formData, onChange, global, isAdmin }: CompanySetupSectionProps) {
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-display text-foreground flex items-center">
              Company Setup
              <InfoTooltip text="Configure the management company identity, contact info, location, and projection horizon." />
            </h3>
            <p className="text-muted-foreground text-sm label-text">Configure the management company details and when it starts operations</p>
          </div>
          <Link
            href="/company/icp-definition"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline whitespace-nowrap"
            data-testid="link-icp-definition"
          >
            <IconTarget className="w-4 h-4" />
            Edit ICP Definition
          </Link>
        </div>

        {/* Single-column inner stack — the page itself is already a 2-col
            split (CompanySetupSection on the left, TaxSection on the right).
            Macro/policy controls (Inflation Rate, Model Constants) live in
            TaxSection so this card stays focused on company identity, contact,
            financial, and location. */}
        <div className="space-y-6">
            <Card className="bg-card border border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <IconHash className="w-4 h-4 text-muted-foreground" /> Identity
                </CardTitle>
                <CardDescription className="label-text">Company name and the logo shown in navigation and reports</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stacked vertically — the outer page is already a 2-col split,
                    and each Identity field (logo picker, name input) reads more
                    naturally at full width than squeezed side-by-side. */}
                <div className="space-y-4">
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
                      className={`border-border text-foreground ${!isAdmin ? 'bg-muted cursor-not-allowed opacity-60' : 'bg-card'}`}
                      data-testid="input-company-name"
                    />
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">Only administrators can change the company name</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="flex items-center text-foreground label-text">
                      Company Logo
                      <InfoTooltip text="The company logo displayed in the navigation sidebar and reports." />
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
                </div>
              </CardContent>
            </Card>

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

          {/* ───────── RIGHT COLUMN: Location, Inflation, Model Constants ───────── */}
          <div className="space-y-6">
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
                      <CityCombobox
                        value={(formData.companyCity ?? global.companyCity) || ""}
                        onValueChange={geo.handleCityChange}
                        cities={geo.cities}
                        disabled={!geo.stateCode}
                        placeholder={geo.stateCode ? "Select city" : "Select state first"}
                        className="bg-card"
                        data-testid="select-company-city"
                      />
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
