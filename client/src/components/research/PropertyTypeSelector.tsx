import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const HOSPITALITY_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "resort", label: "Resort" },
  { value: "boutique_hotel", label: "Boutique Hotel" },
  { value: "business_hotel", label: "Business Hotel" },
  { value: "wellness_resort", label: "Wellness Resort" },
  { value: "conference_hotel", label: "Conference Hotel" },
  { value: "extended_stay", label: "Extended Stay" },
] as const;

interface PropertyTypeSelectorProps {
  value: string;
  onChange: (type: string) => void;
  disabled?: boolean;
}

export default function PropertyTypeSelector({ value, onChange, disabled }: PropertyTypeSelectorProps) {
  return (
    <Select value={value || "hotel"} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-hospitality-type">
        <SelectValue placeholder="Select type" />
      </SelectTrigger>
      <SelectContent>
        {HOSPITALITY_TYPES.map((t) => (
          <SelectItem key={t.value} value={t.value} data-testid={`hospitality-type-${t.value}`}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function formatHospitalityType(type: string): string {
  return HOSPITALITY_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function PropertyTypeBadge({ type, starRating }: { type: string; starRating?: number | null }) {
  const label = formatHospitalityType(type);
  const stars = starRating ? "★".repeat(starRating) : "";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
      data-testid="property-type-badge"
    >
      {stars && <span className="text-amber-500">{stars}</span>}
      <span>{label}</span>
    </span>
  );
}
