import type { PropertyContextPack } from "../context-pack/types";

export type RelaxLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type GeoMode = "city" | "msa" | "state" | "country";
export type TypeMode = "exact" | "family" | "any";
export type AmenityMode = "must+major+nice" | "must+major" | "must";

export interface ComparableCriteria {
  level: RelaxLevel;
  starMin: number | null;
  starMax: number | null;
  typeMode: TypeMode;
  allowedTypes: string[];
  geoMode: GeoMode;
  geoValue: string | null;
  sizeRange: [number, number] | null;
  adrRange: [number, number] | null;
  amenityMode: AmenityMode;
  mustAmenities: string[];
  majorAmenities: string[];
  niceAmenities: string[];
  retained: string[];
  relaxed: string[];
}

const TYPE_FAMILIES: Record<string, string[]> = {
  hotel: ["hotel", "boutique_hotel", "business_hotel", "conference_hotel"],
  resort: ["resort", "wellness_resort"],
  extended: ["extended_stay"],
};

function getTypeFamily(hospitalityType: string): string[] {
  for (const [, members] of Object.entries(TYPE_FAMILIES)) {
    if (members.includes(hospitalityType)) return members;
  }
  return [hospitalityType];
}

function getAllTypes(): string[] {
  return Object.values(TYPE_FAMILIES).flat();
}

function deriveMsa(city: string | null, stateProvince: string | null): string | null {
  if (!city) return stateProvince;
  return `${city}, ${stateProvince ?? ""}`.trim();
}

function buildAmenityLists(pack: PropertyContextPack): { must: string[]; major: string[]; nice: string[] } {
  const must: string[] = [];
  const major: string[] = [];
  const nice: string[] = [];

  if (pack.amenityProfile.hasFB) must.push("F&B");
  if (pack.amenityProfile.hasEvents) major.push("events");
  if (pack.amenityProfile.hasWellness) major.push("wellness");

  if (pack.physicalCharacter.roomCount > 30) nice.push("conference");
  if (pack.revenueProfile.cateringBoostPercent && pack.revenueProfile.cateringBoostPercent > 0) nice.push("catering");

  return { must, major, nice };
}

export class ComparableQueryBuilder {
  private pack: PropertyContextPack;
  private star: number | null;
  private type: string;
  private city: string | null;
  private state: string | null;
  private country: string | null;
  private rooms: number;
  private adr: number;
  private amenities: { must: string[]; major: string[]; nice: string[] };

  constructor(pack: PropertyContextPack) {
    this.pack = pack;
    this.star = pack.classification.starRating ?? pack.classification.starRatingSuggested;
    this.type = pack.classification.hospitalityType;
    this.city = pack.location.city;
    this.state = pack.location.stateProvince;
    this.country = pack.location.country;
    this.rooms = pack.physicalCharacter.roomCount;
    this.adr = pack.revenueProfile.startAdr;
    this.amenities = buildAmenityLists(pack);
  }

  build(level: RelaxLevel): ComparableCriteria {
    switch (level) {
      case 0: return this.buildL0();
      case 1: return this.buildL1();
      case 2: return this.buildL2();
      case 3: return this.buildL3();
      case 4: return this.buildL4();
      case 5: return this.buildL5();
    }
  }

  buildAll(maxLevel: RelaxLevel = 5): ComparableCriteria[] {
    const results: ComparableCriteria[] = [];
    for (let l = 0; l <= maxLevel; l++) {
      results.push(this.build(l as RelaxLevel));
    }
    return results;
  }

  private starBounds(delta: number): { min: number | null; max: number | null } {
    if (this.star == null) return { min: null, max: null };
    const clamped = Math.min(delta, 1);
    return {
      min: Math.max(1, this.star - clamped),
      max: Math.min(5, this.star + clamped),
    };
  }

  private sizeRange(pct: number): [number, number] {
    return [
      Math.max(1, Math.round(this.rooms * (1 - pct))),
      Math.round(this.rooms * (1 + pct)),
    ];
  }

  private adrRangePct(pct: number): [number, number] {
    return [
      Math.round(this.adr * (1 - pct)),
      Math.round(this.adr * (1 + pct)),
    ];
  }

  private buildL0(): ComparableCriteria {
    const { min, max } = this.starBounds(0);
    return {
      level: 0,
      starMin: min, starMax: max,
      typeMode: "exact", allowedTypes: [this.type],
      geoMode: "city", geoValue: this.city,
      sizeRange: this.sizeRange(0.2),
      adrRange: null,
      amenityMode: "must+major+nice",
      mustAmenities: this.amenities.must,
      majorAmenities: this.amenities.major,
      niceAmenities: this.amenities.nice,
      retained: ["star±0", "exactType", "city", "size±20%", "must+major+nice"],
      relaxed: [],
    };
  }

  private buildL1(): ComparableCriteria {
    const { min, max } = this.starBounds(0);
    return {
      level: 1,
      starMin: min, starMax: max,
      typeMode: "exact", allowedTypes: [this.type],
      geoMode: "city", geoValue: this.city,
      sizeRange: this.sizeRange(0.2),
      adrRange: null,
      amenityMode: "must+major",
      mustAmenities: this.amenities.must,
      majorAmenities: this.amenities.major,
      niceAmenities: [],
      retained: ["star±0", "exactType", "city", "size±20%", "must+major"],
      relaxed: ["niceAmenities"],
    };
  }

  private buildL2(): ComparableCriteria {
    const { min, max } = this.starBounds(1);
    return {
      level: 2,
      starMin: min, starMax: max,
      typeMode: "family", allowedTypes: getTypeFamily(this.type),
      geoMode: "msa", geoValue: deriveMsa(this.city, this.state),
      sizeRange: this.sizeRange(0.4),
      adrRange: this.adrRangePct(0.3),
      amenityMode: "must+major",
      mustAmenities: this.amenities.must,
      majorAmenities: this.amenities.major,
      niceAmenities: [],
      retained: ["star±1", "typeFamily", "msa", "size±40%", "adr±30%", "must+major"],
      relaxed: ["niceAmenities", "exactType→family", "city→msa", "size20→40%"],
    };
  }

  private buildL3(): ComparableCriteria {
    const { min, max } = this.starBounds(1);
    return {
      level: 3,
      starMin: min, starMax: max,
      typeMode: "any", allowedTypes: getAllTypes(),
      geoMode: "msa", geoValue: deriveMsa(this.city, this.state),
      sizeRange: null,
      adrRange: null,
      amenityMode: "must",
      mustAmenities: this.amenities.must,
      majorAmenities: [],
      niceAmenities: [],
      retained: ["star±1", "msa", "must"],
      relaxed: ["niceAmenities", "majorAmenities", "typeFamily→any", "sizeRange", "adrRange"],
    };
  }

  private buildL4(): ComparableCriteria {
    const { min, max } = this.starBounds(1);
    return {
      level: 4,
      starMin: min, starMax: max,
      typeMode: "any", allowedTypes: getAllTypes(),
      geoMode: "state", geoValue: this.state,
      sizeRange: null,
      adrRange: null,
      amenityMode: "must",
      mustAmenities: this.amenities.must,
      majorAmenities: [],
      niceAmenities: [],
      retained: ["star±1", "state", "must"],
      relaxed: ["niceAmenities", "majorAmenities", "typeFamily→any", "sizeRange", "adrRange", "msa→state"],
    };
  }

  private buildL5(): ComparableCriteria {
    const { min, max } = this.starBounds(1);
    const sizeBucket = this.rooms <= 15 ? [1, 25] as [number, number]
      : this.rooms <= 50 ? [10, 80] as [number, number]
      : [30, 200] as [number, number];
    return {
      level: 5,
      starMin: min, starMax: max,
      typeMode: "any", allowedTypes: getAllTypes(),
      geoMode: "country", geoValue: this.country,
      sizeRange: sizeBucket,
      adrRange: null,
      amenityMode: "must",
      mustAmenities: this.amenities.must,
      majorAmenities: [],
      niceAmenities: [],
      retained: ["star±1", "country", "sizeBucket"],
      relaxed: ["niceAmenities", "majorAmenities", "typeFamily→any", "adrRange", "state→country", "size→bucket"],
    };
  }
}
