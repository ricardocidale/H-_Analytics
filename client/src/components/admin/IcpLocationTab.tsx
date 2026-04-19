import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconPlus, IconTrash, IconMapPin, IconGlobe } from "@/components/icons";
import type { AdminSaveState } from "@/components/admin/save-state";
import { X } from "@/components/icons/themed-icons";
import { useGlobalAssumptions, useUpdateAdminConfig } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { IcpLocation } from "./icp-config";

interface GeoCountry {
  name: string;
  isoCode: string;
  flag: string;
}
interface GeoState {
  name: string;
  isoCode: string;
}
interface GeoCity {
  name: string;
  stateCode: string;
  latitude: string;
  longitude: string;
}

function useGeoCountries() {
  return useQuery<GeoCountry[]>({
    queryKey: ["geo-countries"],
    queryFn: async () => {
      const res = await fetch("/api/geo/countries", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch countries");
      return res.json();
    },
    staleTime: Infinity,
  });
}

function useGeoStates(countryCode: string) {
  return useQuery<GeoState[]>({
    queryKey: ["geo-states", countryCode],
    queryFn: async () => {
      const res = await fetch(`/api/geo/states?country=${countryCode}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch states");
      return res.json();
    },
    enabled: !!countryCode,
    staleTime: Infinity,
  });
}

function useGeoCities(countryCode: string, stateCode: string) {
  return useQuery<GeoCity[]>({
    queryKey: ["geo-cities", countryCode, stateCode],
    queryFn: async () => {
      const res = await fetch(`/api/geo/cities?country=${countryCode}&state=${stateCode}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cities");
      return res.json();
    },
    enabled: !!countryCode && !!stateCode,
    staleTime: Infinity,
  });
}

function LocationCard({
  location,
  onUpdate,
  onRemove,
}: {
  location: IcpLocation;
  onUpdate: (loc: IcpLocation) => void;
  onRemove: () => void;
}) {
  const { data: countries = [] } = useGeoCountries();
  const { data: states = [] } = useGeoStates(location.countryCode);

  const [addingState, setAddingState] = useState("");
  const [addingCity, setAddingCity] = useState("");
  const [addingCityState, setAddingCityState] = useState("");
  const [cityRadius, setCityRadius] = useState(25);

  const { data: citiesForState = [] } = useGeoCities(location.countryCode, addingCityState);

  const handleCountryChange = (isoCode: string) => {
    const country = countries.find((c) => c.isoCode === isoCode);
    if (country) {
      onUpdate({ ...location, country: country.name, countryCode: isoCode, states: [], cities: [] });
    }
  };

  const handleAddState = (stateCode: string) => {
    if (!stateCode || location.states.includes(stateCode)) return;
    onUpdate({ ...location, states: [...location.states, stateCode] });
    setAddingState("");
  };

  const handleRemoveState = (stateCode: string) => {
    onUpdate({
      ...location,
      states: location.states.filter((s) => s !== stateCode),
      cities: location.cities.filter((c) => {
        const cityData = citiesForState.find((gc) => gc.name === c.name);
        return !cityData || cityData.stateCode !== stateCode;
      }),
    });
  };

  const handleAddCity = () => {
    if (!addingCity) return;
    if (location.cities.some((c) => c.name === addingCity)) return;
    onUpdate({
      ...location,
      cities: [...location.cities, { name: addingCity, radius: cityRadius }],
    });
    setAddingCity("");
    setCityRadius(25);
  };

  const handleRemoveCity = (cityName: string) => {
    onUpdate({
      ...location,
      cities: location.cities.filter((c) => c.name !== cityName),
    });
  };

  const handleCityRadiusChange = (cityName: string, radius: number) => {
    onUpdate({
      ...location,
      cities: location.cities.map((c) => (c.name === cityName ? { ...c, radius } : c)),
    });
  };

  const stateNames = (codes: string[]) =>
    codes.map((code) => {
      const s = states.find((st) => st.isoCode === code);
      return s ? s.name : code;
    });

  return (
    <Card className="bg-card border border-border/80 shadow-sm" data-testid={`card-location-${location.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <IconMapPin className="w-4 h-4 text-muted-foreground" />
            {location.country || "New Location"}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid={`button-remove-location-${location.id}`}
            aria-label="Remove location"
          >
            <IconTrash className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-foreground flex items-center">
            Country <span className="text-destructive/80 ml-0.5">*</span>
            <InfoTooltip text="Required. The country where target customers or investment properties are located." side="right" />
          </Label>
          <Select value={location.countryCode} onValueChange={handleCountryChange}>
            <SelectTrigger className="bg-card" data-testid={`select-country-${location.id}`}>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {countries.map((c) => (
                <SelectItem key={c.isoCode} value={c.isoCode}>
                  {c.flag} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {location.countryCode && (
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground flex items-center">
              States / Provinces
              <InfoTooltip text="Optional. Narrow the location to specific states or provinces. Leave empty to target the entire country." side="right" />
            </Label>
            <div className="flex items-center gap-2">
              <Select value={addingState} onValueChange={handleAddState}>
                <SelectTrigger className="bg-card flex-1" data-testid={`select-state-${location.id}`}>
                  <SelectValue placeholder="Add state / province" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {states
                    .filter((s) => !location.states.includes(s.isoCode))
                    .map((s) => (
                      <SelectItem key={s.isoCode} value={s.isoCode}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {location.states.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {stateNames(location.states).map((name, i) => (
                  <Badge
                    key={location.states[i]}
                    variant="secondary"
                    className="text-xs gap-1 pr-1"
                  >
                    {name}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveState(location.states[i])}
                      className="ml-0.5 h-4 w-4 p-0 hover:text-destructive hover:bg-transparent"
                      data-testid={`remove-state-${location.states[i]}`}
                      aria-label={`Remove ${name}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {location.countryCode && location.states.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground flex items-center">
              Cities
              <InfoTooltip text="Optional. Add specific cities with a search radius (in miles) for more targeted analysis. The radius defines how far from the city center to include." side="right" />
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">in</span>
              <Select value={addingCityState} onValueChange={setAddingCityState}>
                <SelectTrigger className="bg-card w-[130px] h-8 text-xs" data-testid={`select-city-state-${location.id}`}>
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {location.states.map((sc) => {
                    const s = states.find((st) => st.isoCode === sc);
                    return (
                      <SelectItem key={sc} value={sc}>
                        {s?.name || sc}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select value={addingCity} onValueChange={setAddingCity}>
                <SelectTrigger className="bg-card flex-1" data-testid={`select-city-${location.id}`}>
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {citiesForState
                    .filter((c) => !location.cities.some((lc) => lc.name === c.name))
                    .map((c) => (
                      <SelectItem key={`${c.name}-${c.stateCode}`} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={cityRadius}
                  onChange={(e) => setCityRadius(Number(e.target.value) || 25)}
                  className="w-16 bg-card text-xs text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min={1}
                  max={500}
                  data-testid={`input-radius-new-${location.id}`}
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">mi</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddCity}
                disabled={!addingCity}
                className="h-9 px-2"
                data-testid={`button-add-city-${location.id}`}
                aria-label="Add city"
              >
                <IconPlus className="w-3.5 h-3.5" />
              </Button>
            </div>

            {location.cities.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {location.cities.map((city) => (
                  <div
                    key={city.name}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/30"
                    data-testid={`city-card-${city.name}`}
                  >
                    <span className="text-xs font-medium text-foreground truncate min-w-0">{city.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input
                        type="number"
                        value={city.radius}
                        onChange={(e) => handleCityRadiusChange(city.name, Number(e.target.value) || 25)}
                        className="w-16 h-7 bg-card text-xs text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        min={1}
                        max={500}
                        data-testid={`input-radius-${city.name}`}
                      />
                      <span className="text-[10px] text-muted-foreground">mi</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveCity(city.name)}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive hover:bg-transparent transition-colors"
                        data-testid={`remove-city-${city.name}`}
                        aria-label={`Remove ${city.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5 pt-2 border-t border-border/40">
          <Label className="text-xs font-medium text-foreground flex items-center">
            Additional Notes
            <InfoTooltip text="Optional. Free-text context for the AI research engine — e.g. neighborhoods to exclude, proximity preferences, zoning notes, or market nuances specific to this location." side="right" />
          </Label>
          <Textarea
            value={location.notes || ""}
            onChange={(e) => onUpdate({ ...location, notes: e.target.value })}
            placeholder="e.g. Exclude downtown areas, prefer properties near international airport, focus on gated communities, include suburban neighborhoods within 10 min of city center..."
            className="min-h-[72px] text-xs leading-relaxed resize-y placeholder:text-muted-foreground/50 placeholder:italic"
            data-testid={`textarea-notes-${location.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export interface IcpLocationTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

export default function IcpLocationTab({ onSaveStateChange }: IcpLocationTabProps = {}) {
  const { data: ga, isLoading: gaLoading } = useGlobalAssumptions();
  const updateMutation = useUpdateAdminConfig();
  const { toast } = useToast();

  const [locations, setLocations] = useState<IcpLocation[]>([]);
  const [dirty, setDirty] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  useEffect(() => {
    if (ga?.icpConfig) {
      const cfg = ga.icpConfig as Record<string, any>;
      const saved = cfg._locations as IcpLocation[] | undefined;
      if (saved && saved.length > 0) {
        setLocations(saved);
        setDirty(false);
        setDefaultsLoaded(true);
      } else if (!defaultsLoaded) {
        fetch("/api/geo/default-locations", { credentials: "include" })
          .then((r) => r.ok ? r.json() : [])
          .then((defaults: IcpLocation[]) => {
            if (defaults.length > 0) {
              setLocations(defaults);
              setDirty(true);
            }
            setDefaultsLoaded(true);
          })
          .catch(() => setDefaultsLoaded(true));
      }
    }
  }, [ga?.icpConfig]);

  const handleAddLocation = () => {
    const newLoc: IcpLocation = {
      id: `loc-${Date.now()}`,
      country: "",
      countryCode: "",
      states: [],
      cities: [],
      notes: "",
    };
    setLocations((prev) => [...prev, newLoc]);
    setDirty(true);
  };

  const handleUpdateLocation = useCallback((id: string, updated: IcpLocation) => {
    setLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
    setDirty(true);
  }, []);

  const handleRemoveLocation = useCallback((id: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== id));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const existing = (ga?.icpConfig as Record<string, any>) || {};
    updateMutation.mutate(
      {
        icpConfig: {
          ...existing,
          _locations: locations,
        },
      } as unknown as Parameters<typeof updateMutation.mutate>[0],
      {
        onSuccess: () => {
          setDirty(false);
          toast({ title: "Saved", description: "Target locations saved." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save locations. Please try again.", variant: "destructive" });
        },
      }
    );
  }, [ga?.icpConfig, locations, updateMutation, toast]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const isPending = updateMutation.isPending;
  useEffect(() => {
    if (dirty) {
      onSaveStateChange?.({
        isDirty: true,
        isPending,
        onSave: () => handleSaveRef.current(),
      });
    } else {
      onSaveStateChange?.(null);
    }
    return () => onSaveStateChange?.(null);
  }, [dirty, isPending, onSaveStateChange]);

  if (gaLoading && !ga) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <IconGlobe className="w-4 h-4 text-muted-foreground" />
            Target Locations
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define geographic regions where your ideal customers are located. The management company targets property owners and investors in these markets.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddLocation}
          className="text-xs h-8 gap-1.5"
          data-testid="button-add-location"
        >
          <IconPlus className="w-3.5 h-3.5" />
          Add Location
        </Button>
      </div>

      {locations.length === 0 ? (
        <Card className="bg-card border border-dashed border-border shadow-sm">
          <CardContent className="py-12 text-center">
            <IconMapPin className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No target locations defined</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click <strong>Add Location</strong> to define where your ideal customers are located.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <LocationCard
              key={loc.id}
              location={loc}
              onUpdate={(updated) => handleUpdateLocation(loc.id, updated)}
              onRemove={() => handleRemoveLocation(loc.id)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
