import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NONE_VALUE } from "../SlideFactoryConstants";
import { propLabel } from "../SlideFactoryUtils";
import type { Property } from "../SlideFactoryTypes";

// ── Shared sub-components ───────────────────────────────────────────────────

export function PlaceholderTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}

export function FactoryPropertySelector({
  slideNum,
  description,
  value,
  onChange,
  properties,
  disabled,
}: {
  slideNum: number;
  description: string;
  value: number | null;
  onChange: (v: number | null) => void;
  properties: Property[];
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Slide {slideNum}
        </span>
        <span className="text-xs text-muted-foreground">— {description}</span>
      </div>
      <Select
        value={value ? String(value) : NONE_VALUE}
        onValueChange={(v) => onChange(v === NONE_VALUE ? null : Number(v))}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a property…">
            {value ? propLabel(properties, value) : "Select a property…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— None —</SelectItem>
          {properties.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
              {p.city
                ? ` — ${p.city}${p.stateProvince ? `, ${p.stateProvince}` : ""}`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
