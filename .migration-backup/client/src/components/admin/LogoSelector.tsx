import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAdminLogos } from "./hooks";
import { LOGO_PREVIEW } from "./styles";
import defaultLogo from "@/assets/logo.png";

interface LogoSelectorProps {
  label: string;
  value: number | null | undefined;
  onChange: (logoId: number | null) => void;
  showNone?: boolean;
  useDefaultFallback?: boolean;
  emptyLabel?: string;
  helpText?: string;
  testId?: string;
  fallbackUrl?: string;
}

export default function LogoSelector({
  label,
  value,
  onChange,
  showNone = true,
  useDefaultFallback = false,
  emptyLabel = "No Logo",
  helpText = "Select from Logo Portfolio",
  testId = "select-logo",
  fallbackUrl,
}: LogoSelectorProps) {
  const { data: allLogos } = useAdminLogos();
  // Exclude logos that shouldn't appear in the management-company picker:
  // - The app identity logo (e.g. H+ Analytics) is managed on Admin → App Identity only.
  // - Proprietary brand logos (Numeratti, Norfolk AI) are tied to their owning companies
  //   and aren't offered as generic options.
  // Exception: if the company currently has one of these logos assigned, keep it in the
  // list so the dropdown still shows its name instead of going blank.
  const HIDDEN_NAMES = new Set(["Numeratti Logo", "Norfolk AI Logo"]);
  const filteredLogos = allLogos?.filter(l => !l.isAppLogo && !HIDDEN_NAMES.has(l.name));
  const currentLogo = value != null ? allLogos?.find(l => l.id === value) : undefined;
  const logos = currentLogo && !filteredLogos?.some(l => l.id === currentLogo.id)
    ? [...(filteredLogos ?? []), currentLogo]
    : filteredLogos;

  const defaultLogoEntry = logos?.find(l => l.isDefault);
  const effectiveValue = useDefaultFallback && value == null ? defaultLogoEntry?.id ?? null : value;

  const resolvedUrl = (() => {
    if (effectiveValue) {
      const logo = allLogos?.find(l => l.id === effectiveValue);
      if (logo) return logo.url;
    }
    return fallbackUrl || defaultLogo;
  })();

  const selectValue = effectiveValue ? String(effectiveValue) : (showNone ? "none" : "");

  return (
    <div className="space-y-2">
      <Label className="label-text text-foreground">{label}</Label>
      <div className="flex items-center gap-4">
        <div className={LOGO_PREVIEW}>
          <img src={resolvedUrl} alt={label} className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 space-y-1 max-w-sm">
          <Select
            value={selectValue}
            onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
          >
            <SelectTrigger data-testid={testId}><SelectValue /></SelectTrigger>
            <SelectContent>
              {showNone && <SelectItem value="none">{emptyLabel}</SelectItem>}
              {logos?.map(logo => (
                <SelectItem key={logo.id} value={String(logo.id)}>
                  <span className="flex items-center gap-2">
                    <img src={logo.url} alt="" className="w-5 h-5 rounded object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = defaultLogo; }} />
                    {logo.name}{logo.isDefault ? " (Default)" : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{helpText}</p>
        </div>
      </div>
    </div>
  );
}
