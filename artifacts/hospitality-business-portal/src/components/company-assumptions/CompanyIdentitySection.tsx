import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { GlobalResponse } from "@/lib/api";

interface Props {
  formData: Partial<GlobalResponse>;
  onChange: <K extends keyof GlobalResponse>(field: K, value: GlobalResponse[K]) => void;
  global: GlobalResponse;
}

export default function CompanyIdentitySection({ formData, onChange, global }: Props) {
  function val<K extends keyof GlobalResponse>(k: K): GlobalResponse[K] {
    return formData[k] !== undefined ? (formData[k] as GlobalResponse[K]) : global[k];
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
      <div className="rounded-lg p-6 bg-card border border-border shadow-sm space-y-4">
        <h3 className="text-lg font-display text-foreground">Identity</h3>

        <div className="space-y-2" data-field="companyName">
          <Label className="label-text flex items-center gap-1">
            Company Name
            <InfoTooltip text="The management company's trading name. Displayed in the navigation header, reports, and PDF exports." />
          </Label>
          <Input
            value={(val("companyName") as string) ?? ""}
            onChange={(e) => onChange("companyName", e.target.value as GlobalResponse["companyName"])}
            placeholder="e.g., Hospitality Business Group"
            className="bg-card border-border"
          />
        </div>

        <div className="space-y-2" data-field="companyEin">
          <Label className="label-text flex items-center gap-1">
            EIN / Tax ID
            <InfoTooltip text="Employer Identification Number or tax registration number. Printed on financial reports and investor documents." />
          </Label>
          <Input
            value={(val("companyEin") as string | null) ?? ""}
            onChange={(e) => onChange("companyEin", (e.target.value || null) as GlobalResponse["companyEin"])}
            placeholder="e.g., 12-3456789"
            className="bg-card border-border"
          />
        </div>

        <div className="space-y-2" data-field="companyFoundingYear">
          <Label className="label-text flex items-center gap-1">
            Founding Year
            <InfoTooltip text="Year the management company was incorporated or founded." />
          </Label>
          <Input
            type="number"
            value={(val("companyFoundingYear") as number | null) ?? ""}
            onChange={(e) =>
              onChange(
                "companyFoundingYear",
                (e.target.value ? Number(e.target.value) : null) as GlobalResponse["companyFoundingYear"],
              )
            }
            placeholder="e.g., 2024"
            min={1900}
            max={2100}
            className="bg-card border-border"
          />
        </div>
      </div>

      <div className="rounded-lg p-6 bg-card border border-border shadow-sm space-y-4">
        <h3 className="text-lg font-display text-foreground">Contact</h3>

        <div className="space-y-2" data-field="companyPhone">
          <Label className="label-text flex items-center gap-1">
            Phone
            <InfoTooltip text="Company phone number shown on investor reports and executive summaries." />
          </Label>
          <Input
            value={(val("companyPhone") as string | null) ?? ""}
            onChange={(e) => onChange("companyPhone", (e.target.value || null) as GlobalResponse["companyPhone"])}
            placeholder="e.g., +1 (212) 555-0100"
            className="bg-card border-border"
          />
        </div>

        <div className="space-y-2" data-field="companyEmail">
          <Label className="label-text flex items-center gap-1">
            Email
            <InfoTooltip text="Primary contact email for the management company." />
          </Label>
          <Input
            type="email"
            value={(val("companyEmail") as string | null) ?? ""}
            onChange={(e) => onChange("companyEmail", (e.target.value || null) as GlobalResponse["companyEmail"])}
            placeholder="e.g., info@company.com"
            className="bg-card border-border"
          />
        </div>

        <div className="space-y-2" data-field="companyWebsite">
          <Label className="label-text flex items-center gap-1">
            Website
            <InfoTooltip text="Company website URL shown on investor reports." />
          </Label>
          <Input
            value={(val("companyWebsite") as string | null) ?? ""}
            onChange={(e) => onChange("companyWebsite", (e.target.value || null) as GlobalResponse["companyWebsite"])}
            placeholder="e.g., https://yourcompany.com"
            className="bg-card border-border"
          />
        </div>
      </div>

      <div className="rounded-lg p-6 bg-card border border-border shadow-sm space-y-4">
        <h3 className="text-lg font-display text-foreground">Registered Address</h3>

        <div className="space-y-2" data-field="companyStreetAddress">
          <Label className="label-text">Street Address</Label>
          <Input
            value={(val("companyStreetAddress") as string | null) ?? ""}
            onChange={(e) =>
              onChange("companyStreetAddress", (e.target.value || null) as GlobalResponse["companyStreetAddress"])
            }
            placeholder="e.g., 150 West Main Street, Suite 400"
            className="bg-card border-border"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2" data-field="companyCity">
            <Label className="label-text">City</Label>
            <Input
              value={(val("companyCity") as string | null) ?? ""}
              onChange={(e) => onChange("companyCity", (e.target.value || null) as GlobalResponse["companyCity"])}
              placeholder="City"
              className="bg-card border-border"
            />
          </div>
          <div className="space-y-2" data-field="companyStateProvince">
            <Label className="label-text">State / Province</Label>
            <Input
              value={(val("companyStateProvince") as string | null) ?? ""}
              onChange={(e) =>
                onChange("companyStateProvince", (e.target.value || null) as GlobalResponse["companyStateProvince"])
              }
              placeholder="State"
              className="bg-card border-border"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2" data-field="companyZipPostalCode">
            <Label className="label-text">Zip / Postal Code</Label>
            <Input
              value={(val("companyZipPostalCode") as string | null) ?? ""}
              onChange={(e) =>
                onChange("companyZipPostalCode", (e.target.value || null) as GlobalResponse["companyZipPostalCode"])
              }
              placeholder="Zip"
              className="bg-card border-border"
            />
          </div>
          <div className="space-y-2" data-field="companyCountry">
            <Label className="label-text">Country</Label>
            <Input
              value={(val("companyCountry") as string | null) ?? ""}
              onChange={(e) =>
                onChange("companyCountry", (e.target.value || null) as GlobalResponse["companyCountry"])
              }
              placeholder="Country"
              className="bg-card border-border"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
