import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { IconMapPin } from "@/components/icons";
import { cn } from "@/lib/utils";

interface AutocompleteSuggestion {
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
  onPlaceSelect?: (details: PlaceDetails) => void;
  placeholder?: string;
  id?: string;
  "data-testid"?: string;
  className?: string;
  disabled?: boolean;
  countryBias?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing an address...",
  id,
  "data-testid": testId,
  className,
  disabled,
  countryBias,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string): Promise<void> => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (countryBias) {
        params.set("country", countryBias);
      }
      const res = await fetch(`/api/places/autocomplete?${params.toString()}`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (res.ok) {
        const data: AutocompleteSuggestion[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setSuggestions([]);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [countryBias]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = async (suggestion: AutocompleteSuggestion) => {
    onChange(suggestion.mainText);
    setShowSuggestions(false);
    setSuggestions([]);

    if (onPlaceSelect) {
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
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <IconMapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          data-testid={testId}
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          className={cn("pl-8", className)}
          autoComplete="off"
          disabled={disabled}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-[220px] overflow-y-auto" data-testid="autocomplete-suggestions">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/50 last:border-0 cursor-pointer"
              onClick={() => handleSelect(s)}
              data-testid={`suggestion-${s.placeId}`}
            >
              <div className="text-sm font-medium text-foreground">{s.mainText}</div>
              <div className="text-xs text-muted-foreground">{s.secondaryText}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
