import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { IconMapPin } from "@/components/icons";

interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  formattedAddress: string;
  streetAddress: string;
  city: string;
  stateProvince: string;
  zipPostalCode: string;
  country: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (details: PlaceDetails) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing an address...",
  className,
  disabled,
  "data-testid": testId,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = React.useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const fetchSuggestions = React.useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(query)}`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (res.ok) {
        const data: PlaceSuggestion[] = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setSuggestions([]);
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setOpen(false);
    setSuggestions([]);
    onChange(suggestion.mainText);
    try {
      const res = await fetch(`/api/places/details/${encodeURIComponent(suggestion.placeId)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const details: PlaceDetails = await res.json();
        if (details.streetAddress) {
          onChange(details.streetAddress);
        }
        onPlaceSelect(details);
      }
    } catch {
      // silently fail — user still has the text they typed
    }
  };

  const handleFocus = () => {
    if (suggestions.length > 0) setOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <IconMapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pl-8", className)}
          data-testid={testId}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-[220px] overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent cursor-pointer flex flex-col gap-0.5 transition-colors"
              onClick={() => handleSelect(s)}
              data-testid={testId ? `${testId}-suggestion-${s.placeId}` : undefined}
            >
              <span className="font-medium text-foreground">{s.mainText}</span>
              <span className="text-xs text-muted-foreground">{s.secondaryText}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
