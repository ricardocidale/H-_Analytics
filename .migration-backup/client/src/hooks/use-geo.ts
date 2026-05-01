import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

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

export function useGeoCountries() {
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

export function useGeoStates(countryCode: string) {
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

export function useGeoCities(countryCode: string, stateCode: string) {
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

function ciMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const GEO_CLEAR_VALUE = "__clear__";

interface UseGeoSelectOptions {
  countryName: string;
  stateName: string;
  onCountryChange: (name: string) => void;
  onStateChange: (name: string) => void;
  onCityChange: (name: string) => void;
}

export function useGeoSelect({
  countryName,
  stateName,
  onCountryChange,
  onStateChange,
  onCityChange,
}: UseGeoSelectOptions) {
  const { data: countries = [] } = useGeoCountries();

  const [countryCode, setCountryCode] = useState("");
  const [stateCode, setStateCode] = useState("");

  const { data: states = [] } = useGeoStates(countryCode);
  const { data: cities = [] } = useGeoCities(countryCode, stateCode);

  useEffect(() => {
    if (!countries.length || !countryName) {
      setCountryCode("");
      return;
    }
    const match = countries.find(
      (c) => ciMatch(c.name, countryName) || ciMatch(c.isoCode, countryName)
    );
    setCountryCode(match?.isoCode || "");
  }, [countries, countryName]);

  useEffect(() => {
    if (!states.length || !stateName) {
      setStateCode("");
      return;
    }
    const match = states.find(
      (s) => ciMatch(s.name, stateName) || ciMatch(s.isoCode, stateName)
    );
    setStateCode(match?.isoCode || "");
  }, [states, stateName]);

  const handleCountryChange = (isoCode: string) => {
    if (isoCode === GEO_CLEAR_VALUE) {
      setCountryCode("");
      setStateCode("");
      onCountryChange("");
      onStateChange("");
      onCityChange("");
      return;
    }
    const country = countries.find((c) => c.isoCode === isoCode);
    if (country) {
      setCountryCode(isoCode);
      setStateCode("");
      onCountryChange(country.name);
      onStateChange("");
      onCityChange("");
    }
  };

  const handleStateChange = (isoCode: string) => {
    if (isoCode === GEO_CLEAR_VALUE) {
      setStateCode("");
      onStateChange("");
      onCityChange("");
      return;
    }
    const state = states.find((s) => s.isoCode === isoCode);
    if (state) {
      setStateCode(isoCode);
      onStateChange(state.name);
      onCityChange("");
    }
  };

  const handleCityChange = (name: string) => {
    if (name === GEO_CLEAR_VALUE) {
      onCityChange("");
      return;
    }
    onCityChange(name);
  };

  return {
    countries,
    states,
    cities,
    countryCode,
    stateCode,
    handleCountryChange,
    handleStateChange,
    handleCityChange,
  };
}
