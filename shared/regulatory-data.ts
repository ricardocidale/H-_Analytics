/**
 * Pre-collected regulatory data for hospitality property conversion.
 *
 * This module provides structured information about zoning, licensing,
 * building codes, foreign investment rules, and labor regulations for
 * each country the app supports. Investors need this context before
 * committing capital to a property in a specific jurisdiction.
 *
 * IMPORTANT: This is reference data, not legal advice. Values marked
 * "varies by jurisdiction" or "consult local counsel" indicate areas
 * where the answer depends on sub-national rules (state, province,
 * municipality). Always verify with qualified local professionals.
 *
 * Last comprehensive review: 2026-04-13
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RegulatoryProfile {
  country: string;
  countryCode: string;

  /** Hospitality licensing requirements */
  licensing: {
    nationalLicenseRequired: boolean;
    localPermitRequired: boolean;
    licenseType: string;
    typicalTimeline: string;
    renewalFrequency: string;
    estimatedCost: string;
    notes?: string;
  };

  /** Zoning & land use conversion rules */
  zoning: {
    residentialToCommercialAllowed: boolean;
    zoningChangeRequired: boolean;
    typicalZoningTimeline: string;
    environmentalReviewRequired: boolean;
    historicPreservation: boolean;
    notes?: string;
  };

  /** Building & safety code standards */
  buildingCodes: {
    fireCodeStandard: string;
    adaEquivalent: string;
    seismicRequirements: boolean;
    energyEfficiencyCode: string;
    maxOccupancyRegulation: string;
    notes?: string;
  };

  /** Foreign investment rules */
  foreignInvestment: {
    foreignOwnershipAllowed: boolean;
    ownershipRestrictions: string;
    repatriationRestrictions: boolean;
    treatyProtections: string;
    notes?: string;
  };

  /** Employment / labor regulations */
  labor: {
    minimumWage: string;
    mandatoryBenefits: string;
    terminationRules: string;
    unionPrevalence: string;
    notes?: string;
  };

  /** ISO date of last data update */
  lastUpdated: string;
  /** URLs or document names used as sources */
  sources: string[];

  /** US-only: state-level overrides for key markets */
  usStateOverrides?: Record<string, Partial<RegulatoryProfile>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Country profiles
// ─────────────────────────────────────────────────────────────────────────────

const REGULATORY_PROFILES: Record<string, RegulatoryProfile> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY COUNTRIES — most detail
  // ═══════════════════════════════════════════════════════════════════════════

  "US": {
    country: "United States",
    countryCode: "US",
    licensing: {
      nationalLicenseRequired: false,
      localPermitRequired: true,
      licenseType: "State/Local Hospitality License, Business License, Liquor License (if applicable)",
      typicalTimeline: "2-6 months (varies significantly by state and municipality)",
      renewalFrequency: "Annual",
      estimatedCost: "$500-$5,000+ depending on jurisdiction and license type",
      notes: "Regulations are primarily STATE and LOCAL level. No single federal hospitality license. Health department permits, fire marshal approval, and certificate of occupancy are universally required. Liquor licenses can take 6-12 months and cost $10,000+ in some states.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-12 months (varies by municipality; can exceed 18 months in dense urban areas)",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Zoning is exclusively local (city/county). Many jurisdictions require a Conditional Use Permit (CUP) or Special Use Permit for hotel/B&B use in residential zones. NEPA applies to federally funded projects; state equivalents (SEQRA in NY, CEQA in CA) may apply. Historic districts (National Register, local landmarks) impose additional review.",
    },
    buildingCodes: {
      fireCodeStandard: "NFPA 101 Life Safety Code; IBC (International Building Code) adopted by most states",
      adaEquivalent: "ADA (Americans with Disabilities Act) — Title III public accommodations",
      seismicRequirements: true,
      energyEfficiencyCode: "ASHRAE 90.1 / IECC (International Energy Conservation Code); varies by state adoption",
      maxOccupancyRegulation: "Determined by local fire marshal per IBC Chapter 10 occupancy load calculations",
      notes: "ADA compliance is federal and non-negotiable for public accommodations (hotels). Seismic requirements vary by zone — critical in CA, WA, OR, parts of UT, NY (Zone 2A). Sprinkler systems required for hotels in most jurisdictions.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No general restrictions on foreign ownership of real property. CFIUS review may apply to acquisitions near sensitive government installations. Some states restrict agricultural land ownership by foreign entities.",
      repatriationRestrictions: false,
      treatyProtections: "Bilateral Investment Treaties with 40+ countries; USMCA (with Canada/Mexico)",
      notes: "FIRPTA (Foreign Investment in Real Property Tax Act) imposes a 15% withholding on real property dispositions by foreign persons. Consult tax counsel for structuring.",
    },
    labor: {
      minimumWage: "$7.25/hr federal; many states significantly higher (NY $16.00, CA $16.00, UT $7.25)",
      mandatoryBenefits: "Social Security/Medicare (employer share ~7.65%), unemployment insurance, workers' comp. No federal mandate for health insurance <50 employees (ACA).",
      terminationRules: "At-will employment in most states (exceptions: MT). WARN Act for mass layoffs (60-day notice for 100+ employees).",
      unionPrevalence: "Low to moderate in hospitality. UNITE HERE active in major metro hotels. Right-to-work laws in 27 states.",
      notes: "Tipped employee minimum wage as low as $2.13/hr federally (with tip credit). State laws vary widely. H-2B visa program available for seasonal hospitality workers.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "https://www.sba.gov/business-guide/launch-your-business/apply-for-licenses-and-permits",
      "https://www.ada.gov/topics/title-iii-public-accommodations/",
      "https://www.irs.gov/individuals/international-taxpayers/firpta",
      "https://www.dol.gov/agencies/whd/minimum-wage/state",
      "NFPA 101 Life Safety Code (2024 edition)",
      "International Building Code (IBC) 2024",
    ],
    usStateOverrides: {
      "New York": {
        licensing: {
          nationalLicenseRequired: false,
          localPermitRequired: true,
          licenseType: "NYC Department of Buildings Certificate of Occupancy, NYS Department of Health Permit, SLA Liquor License",
          typicalTimeline: "4-12 months (NYC is notoriously slow; expediter recommended)",
          renewalFrequency: "Annual for most permits; SLA license every 3 years",
          estimatedCost: "$5,000-$25,000+ (NYC); $1,000-$5,000 (upstate)",
          notes: "NYC requires Special Permit from City Planning Commission for hotels in many zoning districts. Multiple Dwelling Law (MDL) may apply for buildings with 3+ units. NYC hotel development effectively paused in many areas due to City of Yes zoning changes — consult current NYC DCP guidance.",
        },
        zoning: {
          residentialToCommercialAllowed: true,
          zoningChangeRequired: true,
          typicalZoningTimeline: "6-18 months in NYC (ULURP process if rezoning needed); 3-6 months upstate",
          environmentalReviewRequired: true,
          historicPreservation: true,
          notes: "NYC: ULURP (Uniform Land Use Review Procedure) required for rezoning — 7-month minimum. SEQRA (State Environmental Quality Review Act) applies statewide. NYC Landmarks Preservation Commission review required in historic districts (e.g., Greenwich Village, Brooklyn Heights). Upstate: local planning board approval typically faster.",
        },
        buildingCodes: {
          fireCodeStandard: "NYC Building Code (based on IBC with NYC-specific amendments) + FDNY requirements",
          adaEquivalent: "ADA + NYC Local Law 58 (stricter accessibility requirements)",
          seismicRequirements: true,
          energyEfficiencyCode: "NYC Local Law 97 (carbon emissions limits for buildings >25,000 sq ft) + NYStretch Energy Code",
          maxOccupancyRegulation: "NYC Building Code Chapter 10; FDNY Certificate of Fitness required for certain occupancy types",
          notes: "NYC Local Law 97 imposes aggressive carbon penalties starting 2024 for large buildings. Hotel conversions must comply with current energy code, which may require significant HVAC/envelope upgrades. Sprinkler systems mandatory in all hotels.",
        },
      },
      "Utah": {
        licensing: {
          nationalLicenseRequired: false,
          localPermitRequired: true,
          licenseType: "Utah DABC Liquor License (if applicable), local business license, health department food service permit",
          typicalTimeline: "2-4 months",
          renewalFrequency: "Annual",
          estimatedCost: "$500-$3,000",
          notes: "Utah has restrictive liquor laws — DABC (Department of Alcoholic Beverage Control) controls all liquor licenses with a limited quota system. Hotel liquor licenses are available but limited. Planning around liquor service is critical for F&B revenue projections.",
        },
        zoning: {
          residentialToCommercialAllowed: true,
          zoningChangeRequired: true,
          typicalZoningTimeline: "2-6 months",
          environmentalReviewRequired: true,
          historicPreservation: false,
          notes: "Utah counties vary significantly. Summit County (Park City area) has strict resort zone requirements. Rural counties are generally more permissive. Water rights are a critical consideration — verify water availability before any conversion.",
        },
        buildingCodes: {
          fireCodeStandard: "IBC/IFC as adopted by Utah (with state amendments)",
          adaEquivalent: "ADA (federal) — no additional state overlay",
          seismicRequirements: true,
          energyEfficiencyCode: "IECC 2021 as adopted by Utah",
          maxOccupancyRegulation: "Local fire marshal per IBC Chapter 10",
          notes: "Wasatch Fault Zone runs through SLC and surrounding areas — seismic design category D. Mountain properties may have additional snow load requirements. Wildfire interface zone considerations in foothill/mountain areas.",
        },
      },
    },
  },

  "CO": {
    country: "Colombia",
    countryCode: "CO",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "Registro Nacional de Turismo (RNT) — mandatory national tourism registry",
      typicalTimeline: "1-3 months for RNT; additional 1-2 months for local permits",
      renewalFrequency: "Annual renewal of RNT",
      estimatedCost: "$200-$1,000 (RNT); municipal permits vary",
      notes: "RNT is administered by MinCIT (Ministerio de Comercio, Industria y Turismo). All hospitality establishments must register before operating. Failure to register carries fines. Medellín and Cartagena have additional local requirements. Curaduría Urbana approval needed for construction/renovation.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "2-6 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "POT (Plan de Ordenamiento Territorial) governs zoning in each municipality. Medellín: check current POT land use designation — some residential areas allow mixed-use. Cartagena: UNESCO World Heritage Site in the walled city — strict heritage controls via PEMP (Plan Especial de Manejo y Protección). Environmental license from ANLA may be required for larger projects.",
    },
    buildingCodes: {
      fireCodeStandard: "NSR-10 (Normas Colombianas de Diseño y Construcción Sismo Resistente) + NFPA adapted standards",
      adaEquivalent: "NTC 6047 (Norma Técnica Colombiana — accessibility for built environment)",
      seismicRequirements: true,
      energyEfficiencyCode: "RUES (Reglamento de Uso Eficiente de Energía) — relatively new, enforcement varies",
      maxOccupancyRegulation: "Determined by local fire department (Bomberos) inspection",
      notes: "Colombia is in a high seismic zone — NSR-10 compliance is mandatory and strictly enforced. Medellín (Zone Alta) and surrounding areas require robust seismic design. All buildings require a construction license (Licencia de Construcción) from the local Curaduría Urbana.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions on foreign ownership of real property. Equal treatment under Ley 9 de 1991. Must register investment with Banco de la República via declaración de cambio.",
      repatriationRestrictions: false,
      treatyProtections: "US-Colombia BIT (2012); Colombia-EU FTA; Pacific Alliance member",
      notes: "Colombia actively encourages foreign investment in tourism. Tax incentives available for new hotel construction (income tax exemption for 20 years under certain conditions — verify current status of Ley 2068 de 2020 tourism incentives). Exchange registration is mandatory for future repatriation of profits.",
    },
    labor: {
      minimumWage: "COP 1,423,500/month (2026) + transportation subsidy COP 200,000/month",
      mandatoryBenefits: "Health insurance (EPS), pension (AFP), workers' comp (ARL), severance (Cesantías), vacation (15 days/year), prima de servicios (13th month equivalent), dotación (uniforms 3x/year for certain salary levels)",
      terminationRules: "Just cause required for termination without severance. Unjust termination triggers indemnización (severance payment based on tenure). Collective dismissal requires Ministry of Labor authorization.",
      unionPrevalence: "Low to moderate in hospitality. Pactos colectivos more common than formal unions in the sector.",
      notes: "Total employer cost of mandatory benefits adds approximately 50-55% on top of base salary. Night shift (10pm-6am) carries a 35% surcharge. Sunday/holiday work carries a 75% surcharge. Parafiscales (SENA, ICBF, Caja de Compensación) are additional employer charges.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "https://www.mincit.gov.co/minturismo/registro-nacional-de-turismo",
      "https://www.anla.gov.co/",
      "NSR-10 (Reglamento Colombiano de Construcción Sismo Resistente)",
      "Código Sustantivo del Trabajo (Colombia)",
      "Ley 2068 de 2020 (Ley de Turismo)",
      "https://www.banrep.gov.co/",
    ],
  },

  "MX": {
    country: "Mexico",
    countryCode: "MX",
    licensing: {
      nationalLicenseRequired: false,
      localPermitRequired: true,
      licenseType: "Licencia de Funcionamiento (municipal), SECTUR registration, health permits (COFEPRIS)",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Annual for most municipal licenses",
      estimatedCost: "$1,000-$5,000 depending on municipality and property size",
      notes: "SECTUR (Secretaría de Turismo) registration is recommended but not always mandatory. Municipal licencia de funcionamiento is required everywhere. COFEPRIS health permits required for food service. States like Quintana Roo (Cancún) have additional tourism-specific requirements.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Zoning governed by municipal PDU (Plan de Desarrollo Urbano). Environmental impact assessment (MIA — Manifestación de Impacto Ambiental) required through SEMARNAT for projects in coastal or protected zones. INAH (Instituto Nacional de Antropología e Historia) review required for properties in historic zones or near archaeological sites.",
    },
    buildingCodes: {
      fireCodeStandard: "NOM-002-STPS (workplace fire safety); local building regulations vary by state",
      adaEquivalent: "NOM-030-SSA3-2013 (accessibility for persons with disabilities)",
      seismicRequirements: true,
      energyEfficiencyCode: "NOM-008-ENER (building envelope); NOM-020-ENER (thermal insulation for residential — commercial standards vary)",
      maxOccupancyRegulation: "Determined by local Protección Civil inspection",
      notes: "Mexico City, Oaxaca, and Pacific coast are high seismic zones. Mexico's seismic code was significantly updated after the 2017 earthquake. All states require a Director Responsable de Obra (licensed professional) to oversee construction.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "Direct ownership prohibited in 'restricted zone' (50km from coast, 100km from border). Foreign investors must use a fideicomiso (bank trust) for coastal/border properties — effectively grants full use and ownership rights for 50-year renewable terms.",
      repatriationRestrictions: false,
      treatyProtections: "USMCA (US-Mexico-Canada Agreement); numerous BITs",
      notes: "Fideicomiso is a well-established, secure legal mechanism — virtually all foreign-owned coastal hotels use it. Cost: ~$2,000-$5,000 setup + ~$1,000-$2,000/year bank fees. Mexican corporation (S.A. de C.V. or S. de R.L.) is another common structure for larger investments.",
    },
    labor: {
      minimumWage: "MXN 278.80/day general; MXN 419.88/day in northern border free zone (2026)",
      mandatoryBenefits: "IMSS (health/pension — employer ~25-30% of base), INFONAVIT (housing fund 5%), vacation premium (25% of vacation days pay), aguinaldo (15 days pay minimum), profit sharing (PTU — 10% of pre-tax profits)",
      terminationRules: "Just cause required (Ley Federal del Trabajo Art. 47). Unjust termination triggers 3 months' salary + 20 days/year tenure + accrued benefits. Reinstatement can be ordered.",
      unionPrevalence: "Moderate. 2019 labor reform strengthened union democracy. Hospitality sector has active unions in resort areas.",
      notes: "PTU (profit sharing) at 10% of pre-tax profits is a significant cost — capped at 3 months' salary or average of last 3 years, whichever is more favorable to the worker (2021 reform). Factor into financial models. Total employer payroll burden approximately 35-40% above base salary.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Ley Federal del Trabajo (Mexico)",
      "https://www.gob.mx/sectur",
      "https://www.gob.mx/semarnat",
      "COFEPRIS regulations",
      "Ley de Inversión Extranjera",
    ],
  },

  "GB": {
    country: "United Kingdom",
    countryCode: "GB",
    licensing: {
      nationalLicenseRequired: false,
      localPermitRequired: true,
      licenseType: "Planning Permission (Change of Use), Premises Licence (Licensing Act 2003), Food Hygiene Registration",
      typicalTimeline: "3-6 months for planning; 2-3 months for premises licence",
      renewalFrequency: "Premises licence does not expire (one-time grant with annual fee). Planning permission is permanent unless conditional.",
      estimatedCost: "£2,000-£10,000+ (planning application fees vary by property size; premises licence £100-£1,905 based on rateable value)",
      notes: "England, Scotland, Wales, and Northern Ireland have separate planning regimes. Premises Licence under Licensing Act 2003 required for alcohol sales, entertainment, late-night refreshments. Separate Food Business Registration with local Environmental Health.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months (8-13 weeks statutory determination period for planning; can extend significantly)",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Change of Use from residential (Use Class C3) to hotel (Use Class C1) requires full planning permission. Permitted development rights do NOT cover C3→C1. Listed building consent required for Grade I/II* properties — Heritage England must be consulted. Conservation Area restrictions apply broadly in desirable locations. England uses the NPPF (National Planning Policy Framework).",
    },
    buildingCodes: {
      fireCodeStandard: "Building Regulations Part B (Fire Safety); Regulatory Reform (Fire Safety) Order 2005; post-Grenfell Fire Safety Act 2021",
      adaEquivalent: "Equality Act 2010 + Building Regulations Part M (Access to and use of buildings)",
      seismicRequirements: false,
      energyEfficiencyCode: "Building Regulations Part L (Conservation of fuel and power); EPC (Energy Performance Certificate) required — minimum E rating for commercial lettings",
      maxOccupancyRegulation: "Fire Risk Assessment determines maximum occupancy; Housing Act standards for sleeping accommodation",
      notes: "Post-Grenfell reforms have significantly tightened fire safety requirements. Buildings over 18m have additional requirements. EPC minimum standards are expected to tighten to C by 2027-2028 — factor retrofit costs into projections.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions on foreign ownership of real property. National Security and Investment Act 2021 allows government review of acquisitions in sensitive sectors (hospitality is generally not sensitive).",
      repatriationRestrictions: false,
      treatyProtections: "Numerous BITs; UK-US tax treaty for double taxation relief",
      notes: "UK is one of the most open markets for foreign real estate investment. Non-resident capital gains tax applies to UK property dispositions (since 2019). Stamp Duty Land Tax (SDLT) applies to purchases — 2% surcharge for non-UK residents. Annual Tax on Enveloped Dwellings (ATED) may apply if held through a company.",
    },
    labor: {
      minimumWage: "£12.21/hr (National Living Wage, age 21+, April 2025 rate)",
      mandatoryBenefits: "Employer NIC (~13.8%), auto-enrollment pension (employer min 3%), statutory sick pay, 28 days paid holiday (incl. bank holidays), statutory maternity/paternity pay",
      terminationRules: "Unfair dismissal protection after 2 years' continuous service. Statutory notice periods (1 week per year of service, up to 12 weeks). Redundancy consultation requirements.",
      unionPrevalence: "Low in hospitality. Unite and GMB have some hotel sector membership.",
      notes: "Employer National Insurance is a significant payroll cost. Tips/gratuities must be passed to workers in full under the Employment (Allocation of Tips) Act 2023. Skilled Worker visa route available for hospitality managers (but not front-line roles as of 2025 — check current SOL list).",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "https://www.gov.uk/planning-permission-england-wales",
      "https://www.legislation.gov.uk/ukpga/2003/17/contents (Licensing Act 2003)",
      "https://www.gov.uk/national-minimum-wage-rates",
      "Building Regulations 2010 (England & Wales)",
      "National Planning Policy Framework (NPPF)",
    ],
  },

  "CR": {
    country: "Costa Rica",
    countryCode: "CR",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "Declaración Turística (ICT — Instituto Costarricense de Turismo), Patente Municipal, Permiso Sanitario (Ministry of Health)",
      typicalTimeline: "2-4 months for ICT registration; 1-2 months for municipal patent",
      renewalFrequency: "Annual",
      estimatedCost: "$500-$2,000",
      notes: "ICT Declaración Turística provides tourism incentives (tax benefits on imports of equipment). CST (Certificación para la Sostenibilidad Turística) is voluntary but valuable for marketing and may provide additional incentives. Municipality (Municipalidad) patent is mandatory.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-6 months",
      environmentalReviewRequired: true,
      historicPreservation: false,
      notes: "SETENA (Secretaría Técnica Nacional Ambiental) environmental assessment required for most tourism projects. Maritime Zone Law (Ley de Zona Marítimo Terrestre) restricts development within 200m of high-tide line — concessions required. Regulador del Plan Regulador (local zoning plan) governs land use. Many beach areas require concession rather than ownership.",
    },
    buildingCodes: {
      fireCodeStandard: "NFPA standards (widely adopted in Costa Rica); Código Sísmico de Costa Rica 2010",
      adaEquivalent: "Ley 7600 (Ley de Igualdad de Oportunidades para las Personas con Discapacidad)",
      seismicRequirements: true,
      energyEfficiencyCode: "No mandatory national energy code for buildings; voluntary RESET certification gaining traction",
      maxOccupancyRegulation: "Bomberos (fire department) inspection determines occupancy limits",
      notes: "Costa Rica is in a high seismic zone — the 2010 Seismic Code (CSCR-10) is strictly enforced. CFIA (Colegio Federado de Ingenieros y Arquitectos) must approve all construction plans. Licensed Ingeniero Responsable required.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "Foreigners can own property with same rights as citizens (constitutional guarantee). Exception: Maritime Zone (50-200m from coast) requires concession, and concessionaires must be Costa Rican residents or companies with majority Costa Rican ownership. First 50m from coast is public and non-developable.",
      repatriationRestrictions: false,
      treatyProtections: "CAFTA-DR (with US); Costa Rica-EU Association Agreement; numerous BITs",
      notes: "Costa Rica is very welcoming to foreign investment in tourism. Free trade zone (Zona Franca) benefits may apply to certain tourism projects. Pensionado/Rentista visa programs facilitate residency for investors.",
    },
    labor: {
      minimumWage: "CRC 375,000-550,000/month (varies by skill category; hospitality workers are 'calificados')",
      mandatoryBenefits: "CCSS (Caja Costarricense de Seguro Social) — employer ~26.5% of payroll; aguinaldo (13th month), vacation (2 weeks/year), severance (Cesantía — 1 month per year up to 8 years)",
      terminationRules: "Just cause required (Código de Trabajo Art. 81). Unjust termination triggers preaviso (notice pay) + cesantía (severance). Labor courts strongly favor employees.",
      unionPrevalence: "Low in hospitality. Solidarismo (employee associations) more common than unions.",
      notes: "CCSS contributions (~26.5% employer share) are a substantial payroll cost. Overtime: 1.5x after 8 hours. Holiday work at double pay. Thirteen-month salary (aguinaldo) paid in December. Total employer burden approximately 40-45% above base salary.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "https://www.ict.go.cr/",
      "SETENA regulations (Decreto 31849-MINAE-S-MOPT-MAG-MEIC)",
      "Código Sísmico de Costa Rica 2010 (CSCR-10)",
      "Ley 7600 (Accessibility)",
      "Código de Trabajo de Costa Rica",
      "CAFTA-DR text",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECONDARY COUNTRIES — good detail
  // ═══════════════════════════════════════════════════════════════════════════

  "CA": {
    country: "Canada",
    countryCode: "CA",
    licensing: {
      nationalLicenseRequired: false,
      localPermitRequired: true,
      licenseType: "Provincial Tourism Operator License, Municipal Business Licence, Liquor License (provincial)",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Annual",
      estimatedCost: "CAD $500-$5,000 depending on province and municipality",
      notes: "Tourism licensing is provincial. BC, Ontario, Quebec each have distinct regimes. Liquor licenses are provincial (AGCO in Ontario, BCLDB in BC, RACJ in Quebec). Health inspection and food safety certification required for F&B.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-9 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Zoning is municipal. Requires rezoning application or development variance permit. Environmental Assessment Act (federal and provincial) may apply. Heritage designation (federal Historic Sites, provincial registries) restricts alterations.",
    },
    buildingCodes: {
      fireCodeStandard: "National Building Code of Canada (NBC) + National Fire Code of Canada (NFC); provinces adopt with amendments",
      adaEquivalent: "CSA B651 (Accessible Design for the Built Environment); provincial human rights codes; Accessibility for Ontarians with Disabilities Act (AODA) in Ontario",
      seismicRequirements: true,
      energyEfficiencyCode: "National Energy Code of Canada for Buildings (NECB); BC Step Code; Toronto Green Standard",
      maxOccupancyRegulation: "Provincial fire marshal per NBC Part 3 occupancy classifications",
      notes: "Seismic requirements significant in BC (Vancouver, Victoria). Step Code in BC is among the most aggressive energy codes in North America. Bilingual signage may be required in Quebec.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "Prohibition on Purchase of Residential Property by Non-Canadians Act (2023-2027) restricts non-Canadian purchase of residential property. Exemptions exist for commercial-purpose properties. Consult current status — law has been extended/amended multiple times.",
      repatriationRestrictions: false,
      treatyProtections: "USMCA; Canada-EU CETA; numerous BITs",
      notes: "BC and Ontario impose additional Foreign Buyer Taxes (20% in BC, 25% in Ontario) on residential property purchases by foreign nationals. Commercial/hotel properties may be exempt depending on classification. Withholding tax on rental income for non-residents (25%, reducible by treaty).",
    },
    labor: {
      minimumWage: "CAD $16.00-$17.40/hr (varies by province; BC $17.40, Ontario $16.55, Alberta $15.00)",
      mandatoryBenefits: "CPP/QPP (employer ~5.95%), EI (employer ~2.21%), provincial health insurance (employer payroll tax varies), vacation (min 2 weeks), statutory holidays",
      terminationRules: "Provincial employment standards set minimum notice periods. Common law reasonable notice applies (can be substantial — months of pay depending on tenure). Federally regulated workers under Canada Labour Code.",
      unionPrevalence: "Moderate. UNITE HERE Canada active in hotel sector, particularly in major cities.",
      notes: "Provincial payroll taxes vary significantly — Ontario Employer Health Tax (EHT), BC Employer Health Tax, Quebec HSF. Total employer burden approximately 15-25% above base salary depending on province.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "National Building Code of Canada 2020",
      "Investment Canada Act",
      "Prohibition on Purchase of Residential Property by Non-Canadians Act",
      "Provincial employment standards legislation",
    ],
  },

  "FR": {
    country: "France",
    countryCode: "FR",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "Déclaration en mairie (mandatory registration with mayor's office), Atout France classification (star rating), Licence IV (liquor)",
      typicalTimeline: "2-4 months for registration; classification visit can take additional 2-3 months",
      renewalFrequency: "Classification valid for 5 years; business registration ongoing",
      estimatedCost: "EUR 1,000-5,000 (classification fees + municipal charges)",
      notes: "All accommodation establishments must register with the local mairie (town hall) via CERFA form. Atout France star classification is voluntary but nearly universal and affects tax treatment (taxe de séjour rates). Licence IV for alcohol is transferable but increasingly scarce and expensive in major cities.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "PLU (Plan Local d'Urbanisme) governs zoning. Change of destination (changement de destination) from residential to hotel requires planning permission (permis de construire or déclaration préalable). ABF (Architecte des Bâtiments de France) approval mandatory in conservation areas — near a Monument Historique or in a Site Patrimonial Remarquable. Can significantly extend timeline.",
    },
    buildingCodes: {
      fireCodeStandard: "Réglementation ERP (Établissements Recevant du Public) — Type O for hotels; Commission de Sécurité approval required",
      adaEquivalent: "Loi handicap 2005 (Loi n° 2005-102); Ad'AP (Agenda d'Accessibilité Programmée)",
      seismicRequirements: false,
      energyEfficiencyCode: "RT 2020 / RE 2020 (Réglementation Environnementale) for new construction; DPE (Diagnostic de Performance Énergétique) for existing",
      maxOccupancyRegulation: "Commission de Sécurité (ERP regulations) determines capacity based on building classification",
      notes: "ERP regulations are strict — fire safety commission must approve before opening. Hotels are Type O ERP. Category depends on capacity (5th category: <100 persons). Lead and asbestos diagnostics (DTA, CREP) mandatory for pre-1997 buildings.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No general restrictions for EU nationals. Non-EU investors require no special authorization for most real estate. Ministry of Economy can review acquisitions in 'strategic sectors' (hospitality is generally not covered).",
      repatriationRestrictions: false,
      treatyProtections: "EU single market protections; French BITs with 100+ countries; US-France tax treaty",
      notes: "France imposes a 3% tax on real property held by foreign entities (taxe de 3%) unless tax treaty exemption applies. Wealth tax (IFI) may apply to real estate holdings above EUR 1.3M. Notaire fees on purchase approximately 7-8% of purchase price.",
    },
    labor: {
      minimumWage: "EUR 11.88/hr (SMIC brut, 2025 — typically revised annually)",
      mandatoryBenefits: "Employer social charges ~42-45% of gross salary (sécurité sociale, retraite, chômage, formation), 5 weeks paid vacation, RTT (reduced working time) days, 13th month (common by convention collective HCR)",
      terminationRules: "Strict just cause (cause réelle et sérieuse) required. CDI (permanent contracts) dominate. Dismissal process is heavily regulated with mandatory interviews, notice periods, and severance (indemnité de licenciement). Prud'hommes (labor court) strongly favors employees.",
      unionPrevalence: "Moderate. Convention Collective Nationale des HCR (Hotels, Cafés, Restaurants) governs the sector. Multiple unions active (CFDT, CGT, FO).",
      notes: "France's employer social charges are among the highest globally — total employer cost is approximately 1.4-1.5x base salary. 35-hour workweek. Overtime regulated. CDD (fixed-term) contracts limited to specific circumstances. Convention Collective HCR sets minimum wages above SMIC for most hospitality roles.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "https://www.legifrance.gouv.fr/",
      "Réglementation ERP (Arrêté du 25 juin 1980)",
      "Convention Collective Nationale des HCR",
      "https://www.atout-france.fr/",
      "Code de l'urbanisme",
    ],
  },

  "ES": {
    country: "Spain",
    countryCode: "ES",
    licensing: {
      nationalLicenseRequired: false,
      localPermitRequired: true,
      licenseType: "Licencia de Apertura (municipal opening license), Registro de Turismo (autonomous community tourism registry), Licencia de Actividad",
      typicalTimeline: "2-6 months (varies significantly by autonomous community)",
      renewalFrequency: "Tourism registration is ongoing; activity license does not typically expire",
      estimatedCost: "EUR 1,000-5,000",
      notes: "Tourism regulation is devolved to the 17 Comunidades Autónomas — each has its own tourism law and classification system. Andalucía, Cataluña, and Baleares have particularly detailed hotel regulations. Declaración responsable (responsible declaration) has replaced some licensing in certain regions, speeding up the process.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "PGOU (Plan General de Ordenación Urbana) governs municipal zoning. Change of use requires licencia urbanística. Many urban centers have tourist saturation restrictions (Barcelona, Palma de Mallorca limit new hotel licenses). BIC (Bien de Interés Cultural) designation imposes strict heritage controls.",
    },
    buildingCodes: {
      fireCodeStandard: "CTE (Código Técnico de la Edificación) — Documento Básico SI (Seguridad en caso de Incendio)",
      adaEquivalent: "CTE Documento Básico SUA (Seguridad de Utilización y Accesibilidad); autonomous community accessibility laws",
      seismicRequirements: true,
      energyEfficiencyCode: "CTE Documento Básico HE (Ahorro de Energía); mandatory EPC (Certificado de Eficiencia Energética)",
      maxOccupancyRegulation: "CTE occupancy calculations + autonomous community tourism regulations (minimum room sizes, etc.)",
      notes: "CTE is comprehensive and mandatory for all new construction and major renovations. Seismic requirements primarily apply to southern Spain (Andalucía, Murcia — NCSE-02). Minimum room sizes for hotels set by each autonomous community's tourism law.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions for EU/EEA nationals. Non-EU investors must obtain NIE (Número de Identidad de Extranjero). No ownership limits on real property.",
      repatriationRestrictions: false,
      treatyProtections: "EU single market; Spain has BITs with 70+ countries; US-Spain tax treaty",
      notes: "Golden Visa program: EUR 500,000+ real estate investment grants residency permit. ITP (Impuesto sobre Transmisiones Patrimoniales) on resale purchases typically 6-10% depending on autonomous community. New construction subject to IVA (21%).",
    },
    labor: {
      minimumWage: "EUR 1,134/month (14 payments/year, SMI 2025)",
      mandatoryBenefits: "Employer social security ~30% of gross salary, 30 days paid vacation, 14 salary payments/year (paga extra), sick leave coverage",
      terminationRules: "Dismissal requires objective or disciplinary cause. Improcedente (unfair) dismissal: 33 days' salary per year of service (max 24 months). ERE (collective dismissal) requires government approval.",
      unionPrevalence: "Moderate. Convenio Colectivo de Hostelería applies by province. CCOO and UGT are major unions.",
      notes: "Labor costs structured around 14 annual payments (12 monthly + 2 extra pays). Provincial hospitality agreements (Convenio Colectivo de Hostelería) set wages above SMI for most roles. Temporary contracts heavily regulated since 2022 labor reform.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Código Técnico de la Edificación (CTE)",
      "Autonomous community tourism laws",
      "https://www.boe.es/",
      "Ley de Propiedad Horizontal",
    ],
  },

  "IT": {
    country: "Italy",
    countryCode: "IT",
    licensing: {
      nationalLicenseRequired: false,
      localPermitRequired: true,
      licenseType: "SCIA (Segnalazione Certificata di Inizio Attività) filed with municipality, Regional Tourism Classification, ASL (health authority) authorization",
      typicalTimeline: "2-4 months",
      renewalFrequency: "SCIA is ongoing; classification renewed periodically per regional law",
      estimatedCost: "EUR 500-3,000",
      notes: "Tourism regulation is regional (20 regions, each with own classification system). SCIA has streamlined business opening — allows operation after filing if requirements are met. ASL (Azienda Sanitaria Locale) health inspection mandatory for F&B. Star classification administered by each region.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "PRG/PGT (Piano Regolatore Generale / Piano di Governo del Territorio) governs municipal zoning. Cambio di destinazione d'uso requires permesso di costruire or SCIA depending on scope. Soprintendenza (heritage authority) approval required for properties in historic centers — extremely common in Italian cities. Vincolo paesaggistico (landscape constraints) widespread.",
    },
    buildingCodes: {
      fireCodeStandard: "DM 9 aprile 1994 (hotel fire safety regulation) + DM 3 agosto 2015 (new fire prevention code)",
      adaEquivalent: "DM 236/1989 (accessibility requirements); DPR 503/1996 (public buildings accessibility)",
      seismicRequirements: true,
      energyEfficiencyCode: "DLgs 192/2005 (energy performance of buildings, implementing EU EPBD); APE (Attestato di Prestazione Energetica) mandatory",
      maxOccupancyRegulation: "Vigili del Fuoco (fire brigade) determine capacity; SCIA antincendio required for hotels",
      notes: "Italy is seismically active — NTC 2018 (Norme Tecniche per le Costruzioni) is the current structural code. Central Italy (L'Aquila, Norcia) and southern regions are highest risk. Soprintendenza reviews can add months to projects in historic areas. Certificato di Agibilità required before opening.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions for EU nationals. Non-EU investors subject to reciprocity principle (most major countries qualify). No ownership limits.",
      repatriationRestrictions: false,
      treatyProtections: "EU single market; Italy BITs with 90+ countries; US-Italy tax treaty",
      notes: "Imposta di registro (registration tax) on resale: 9% (reduced to 2% for first home — not applicable to hotels). IVA (22%) on new construction. Notaio fees approximately 1-2.5%. Flat tax regime for new residents may benefit individual investors.",
    },
    labor: {
      minimumWage: "No statutory national minimum wage — wages set by CCNL (Contratti Collettivi Nazionali di Lavoro). CCNL Turismo sets hospitality minimums (~EUR 1,300-1,700/month depending on level).",
      mandatoryBenefits: "Employer social contributions ~30-32% of gross; TFR (Trattamento di Fine Rapporto — severance accrual ~6.9%/year); 13th and 14th month salary; 26 days vacation",
      terminationRules: "Just cause or justified reason required. Individual dismissal: notice period per CCNL + TFR payout. Collective dismissal (5+ workers in 120 days): complex procedure with unions and labor office.",
      unionPrevalence: "Moderate to high. CCNL Turismo negotiated by FILCAMS-CGIL, FISASCAT-CISL, UILTuCS-UIL. Sector-wide bargaining sets terms for all workers.",
      notes: "CCNL Turismo governs virtually all hospitality employment terms. 14 monthly payments standard. TFR accrual is a significant ongoing cost. Total employer burden approximately 40-45% above gross salary.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "NTC 2018 (Norme Tecniche per le Costruzioni)",
      "CCNL Turismo",
      "DM 9 aprile 1994 (fire safety for hotels)",
      "https://www.agenziaentrate.gov.it/",
    ],
  },

  "BR": {
    country: "Brazil",
    countryCode: "BR",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "Cadastur (Ministry of Tourism mandatory registry), Alvará de Funcionamento (municipal operating license), ANVISA health permits for F&B",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Annual for Alvará; Cadastur renewed every 2 years",
      estimatedCost: "BRL 2,000-10,000",
      notes: "Cadastur registration is mandatory (Lei 11.771/2008). SBClass (Sistema Brasileiro de Classificação de Meios de Hospedagem) star classification is voluntary. Fire department (Corpo de Bombeiros) AVCB certification mandatory. Environmental licensing (IBAMA for federal; state agencies for local) may be required.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Municipal Plano Diretor governs zoning. IPHAN (Instituto do Patrimônio Histórico e Artístico Nacional) approval required for listed heritage properties. Environmental licensing (Licença Prévia, Licença de Instalação, Licença de Operação) is a three-stage process that can add significant time. Coastal zone (Zona Costeira) has additional protections under federal law.",
    },
    buildingCodes: {
      fireCodeStandard: "State fire codes (varying by state); ABNT NBR 9077 (emergency exits); Corpo de Bombeiros certification (AVCB/CLCB)",
      adaEquivalent: "ABNT NBR 9050 (Acessibilidade a edificações, mobiliário, espaços e equipamentos urbanos)",
      seismicRequirements: false,
      energyEfficiencyCode: "PROCEL Edifica / PBE Edifica (voluntary energy labeling for commercial buildings)",
      maxOccupancyRegulation: "State fire department (Corpo de Bombeiros) determines based on ABNT standards",
      notes: "Fire codes vary significantly by state — São Paulo, Rio de Janeiro, and Minas Gerais have detailed regulations. AVCB (Auto de Vistoria do Corpo de Bombeiros) is mandatory before any commercial operation. Construction requires ART (Anotação de Responsabilidade Técnica) from a licensed engineer.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "Generally no restrictions on urban real property. Rural property acquisition by foreigners is restricted (Lei 5.709/1971) — limited to certain sizes depending on municipality. CPF/CNPJ registration required.",
      repatriationRestrictions: false,
      treatyProtections: "Brazil has few BITs in force. MERCOSUR investment protocols. No BIT with the US — rely on Brazilian domestic law protections.",
      notes: "Foreign investment must be registered with Banco Central do Brasil (RDE-IED) for repatriation rights. ITBI (property transfer tax) varies by municipality (typically 2-3%). Brazil has high regulatory complexity — experienced local counsel essential. Tax treaty network is limited compared to other Latin American markets.",
    },
    labor: {
      minimumWage: "BRL 1,518/month (2025)",
      mandatoryBenefits: "FGTS (8% employer deposit), INSS (employer ~26.8%), 13th salary, 30 days vacation + 1/3 vacation bonus, vale transporte (transport voucher), vale refeição (meal voucher — common by agreement)",
      terminationRules: "Without just cause: 40% FGTS fine + notice period (up to 90 days for long tenure) + accrued rights. Just cause (Art. 482 CLT) limits severance. Labor court (Justiça do Trabalho) heavily favors employees.",
      unionPrevalence: "Moderate. Mandatory union contribution eliminated in 2017 reform but unions remain active. Hospitality workers organized by state-level unions (Sindicato dos Trabalhadores em Turismo e Hospitalidade).",
      notes: "CLT (Consolidação das Leis do Trabalho) is comprehensive. 2017 reform (Lei 13.467) modernized some rules but core protections remain. Total employer burden approximately 60-70% above base salary — among the highest in Latin America. 'eSocial' digital labor compliance system adds administrative complexity.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Lei 11.771/2008 (Política Nacional de Turismo)",
      "CLT (Consolidação das Leis do Trabalho)",
      "ABNT NBR 9050 (Accessibility)",
      "https://cadastur.turismo.gov.br/",
    ],
  },

  "DO": {
    country: "Dominican Republic",
    countryCode: "DO",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "MITUR (Ministerio de Turismo) classification and registration, Municipal business license, Health permits",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Annual",
      estimatedCost: "$500-$2,000",
      notes: "CONFOTUR (Consejo de Fomento Turístico) provides significant tax incentives for tourism projects — up to 15 years of income tax and property tax exemptions for qualifying projects. MITUR classification determines star rating. Pro-tourism government policy makes licensing relatively straightforward.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "2-6 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Municipal land use plans govern zoning. Environmental license required from Ministry of Environment for most tourism projects. Zona Colonial in Santo Domingo has UNESCO heritage protections. Coastal development has additional restrictions under Environmental Law 64-00.",
    },
    buildingCodes: {
      fireCodeStandard: "MOPC (Ministerio de Obras Públicas) regulations; R-001 (Reglamento de Construcciones) references NFPA",
      adaEquivalent: "Ley 5-13 sobre Discapacidad (2013); compliance enforcement varies",
      seismicRequirements: true,
      energyEfficiencyCode: "No mandatory energy efficiency code; voluntary green building initiatives",
      maxOccupancyRegulation: "MOPC and fire department inspection",
      notes: "The Dominican Republic is seismically active (Hispaniola fault zone). R-001 building code is the primary regulation. Hurricane-resistant construction standards are critical. MOPC plan review required for all commercial construction.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions on foreign ownership. Equal treatment under law. Title registration via Tribunal de Tierras (land court) provides strong title protection.",
      repatriationRestrictions: false,
      treatyProtections: "CAFTA-DR (with US); numerous BITs",
      notes: "CONFOTUR incentives are a major draw — 100% income tax exemption for up to 15 years for qualifying tourism projects. Property transfer tax 3%. Highly favorable foreign investment regime. Title insurance recommended despite improved land registration system.",
    },
    labor: {
      minimumWage: "DOP 15,447-21,000/month (varies by company size and sector; tourism sector rates)",
      mandatoryBenefits: "TSS (Social Security — employer ~14.4%), AFP (pension), SFS (health), ARL (workers' comp), vacation (14 days/year), 13th month (Regalía Pascual), participation in profits (10% of net profits, capped)",
      terminationRules: "Desahucio (termination without cause) permitted with notice and severance (Cesantía — 6 days' salary per year for 1st year, increasing up to 23 days/year for 5+ years). Despido justified termination requires documented cause.",
      unionPrevalence: "Low in hospitality.",
      notes: "Profit sharing (participación de los empleados) at 10% of net profits is mandatory and can be a significant cost. Total employer burden approximately 20-25% above base salary (lower than many Latin American countries). Worker-friendly labor courts.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Ley 158-01 (CONFOTUR)",
      "Código de Trabajo de la República Dominicana",
      "https://www.mitur.gob.do/",
      "CAFTA-DR text",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OTHER COUNTRIES — basic detail
  // ═══════════════════════════════════════════════════════════════════════════

  "PT": {
    country: "Portugal",
    countryCode: "PT",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "Turismo de Portugal registration (AL — Alojamento Local, or hotel classification), Câmara Municipal (municipal) license",
      typicalTimeline: "2-4 months",
      renewalFrequency: "AL registration ongoing; hotel classification reviewed periodically",
      estimatedCost: "EUR 500-3,000",
      notes: "AL (Alojamento Local) regime has been significantly restricted in many municipalities since 2023 ('Mais Habitação' law). New AL licenses suspended in many Lisbon and Porto parishes. Hotel classification (1-5 stars) through Turismo de Portugal is a separate regime with different requirements.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "PDM (Plano Director Municipal) governs zoning. Many historic city centers are UNESCO-protected or nationally classified — Câmara Municipal and DGPC (heritage authority) approval required. Coastal zone (POOC) has development restrictions.",
    },
    buildingCodes: {
      fireCodeStandard: "SCIE (Segurança Contra Incêndios em Edifícios) — DL 220/2008 + Portaria 1532/2008",
      adaEquivalent: "DL 163/2006 (accessibility regime for public buildings)",
      seismicRequirements: true,
      energyEfficiencyCode: "REH/RECS (building energy regulation); mandatory EPC (Certificado Energético)",
      maxOccupancyRegulation: "SCIE fire safety assessment determines occupancy",
      notes: "Portugal is seismically active (particularly Lisbon, Algarve). Eurocode 8 seismic provisions apply. Pre-1755 and pre-1958 buildings may require significant structural assessment.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions. Golden Visa program ended for real estate in 2023 but existing visas honored.",
      repatriationRestrictions: false,
      treatyProtections: "EU single market; Portuguese BITs; US-Portugal tax treaty",
      notes: "IMT (property transfer tax) 1-7.5% depending on value. NHR (Non-Habitual Resident) tax regime reformed in 2024 — replaced by IFICI for qualifying professionals. Stamp duty 0.8%.",
    },
    labor: {
      minimumWage: "EUR 870/month (14 payments; 2025)",
      mandatoryBenefits: "Employer social security ~23.75%; 14 salary payments; 22 days vacation; sick leave coverage",
      terminationRules: "Just cause required. Collective dismissal heavily regulated. Indemnización for dismissal. Labor courts favor workers.",
      unionPrevalence: "Low to moderate in hospitality.",
      notes: "Total employer burden approximately 30-35% above gross salary. 14 monthly payments standard.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "https://www.turismodeportugal.pt/",
      "DL 220/2008 (SCIE)",
      "Código do Trabalho (Portugal)",
    ],
  },

  "GR": {
    country: "Greece",
    countryCode: "GR",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "EOT (Greek National Tourism Organisation) Special Operating License, Municipal permit",
      typicalTimeline: "3-6 months",
      renewalFrequency: "EOT license valid for 5 years (renewable)",
      estimatedCost: "EUR 1,000-5,000",
      notes: "EOT (now under Ministry of Tourism) classifies all hotels. Technical specifications (room sizes, amenities) depend on star classification. Environmental and fire safety approvals are prerequisites.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "4-12 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Greek planning is complex. Building permit (Oikodomiki Adeia) required. Archaeological survey mandatory in many areas — Ministry of Culture review can significantly delay projects. Coastal zone (50m from shoreline) generally prohibited from development. Island construction often subject to additional Cycladic/local architectural requirements.",
    },
    buildingCodes: {
      fireCodeStandard: "Fire Protection Regulations (PD 71/1988, updated); fire department (Pyrosvestiki) certification",
      adaEquivalent: "Accessibility provisions in Building Code (NOK); Law 4067/2012 (New Building Code)",
      seismicRequirements: true,
      energyEfficiencyCode: "KENAK (Regulation on Energy Performance of Buildings) implementing EU EPBD; mandatory EPC",
      maxOccupancyRegulation: "Fire department and EOT technical specifications",
      notes: "Greece is in a high seismic zone — EAK 2000 (Greek Seismic Code) and Eurocode 8 apply. Anti-seismic design is critical throughout the country.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "Restrictions on property acquisition near national borders (requires approval from a local committee). No restrictions for EU nationals in most areas.",
      repatriationRestrictions: false,
      treatyProtections: "EU single market; Greek BITs; US-Greece tax treaty",
      notes: "Golden Visa: EUR 250,000+ investment (increased to EUR 500,000 in certain areas). Property transfer tax 3.09%. Strategic Investment Law (4608/2019) provides incentives for large tourism projects.",
    },
    labor: {
      minimumWage: "EUR 830/month (14 payments; 2025 — subject to annual review)",
      mandatoryBenefits: "Employer social security ~22.29% (EFKA); 14 salary payments; 20-26 days vacation; sick leave",
      terminationRules: "Notice period required (varies by tenure — up to 4 months). Severance for employees with 12+ months tenure. Mass dismissal restrictions.",
      unionPrevalence: "Moderate. National General Collective Labor Agreement (EGSSE) sets baseline terms. Hotel sector agreements exist.",
      notes: "14 salary payments standard (extra at Easter, summer, Christmas). Seasonal employment contracts common in island tourism. Total employer burden approximately 30% above gross.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "https://www.mintour.gov.gr/",
      "EAK 2000 (Greek Seismic Code)",
      "KENAK (Energy Performance Regulation)",
    ],
  },

  "AR": {
    country: "Argentina",
    countryCode: "AR",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "Registro de Prestadores Turísticos (national/provincial), Habilitación Municipal (municipal operating license)",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Annual habilitación; tourism registry varies by province",
      estimatedCost: "Varies by province — consult local counsel",
      notes: "Tourism regulation is primarily provincial (23 provinces + CABA each have own tourism laws). National registry through SECTUR (Secretaría de Turismo). Buenos Aires (CABA) has specific regulations under Ley 600 de Turismo.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-8 months (can be significantly longer in Buenos Aires)",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Código de Planeamiento Urbano governs zoning in Buenos Aires. Provinces have own planning codes. Environmental impact assessment required under Ley General del Ambiente 25.675. Heritage protections in Buenos Aires (San Telmo, La Boca), Salta, and other historic cities.",
    },
    buildingCodes: {
      fireCodeStandard: "IRAM fire safety standards; municipal fire regulations; Bomberos certification",
      adaEquivalent: "Ley 24.314 (accessibility for persons with disabilities); IRAM 11.180",
      seismicRequirements: true,
      energyEfficiencyCode: "IRAM 11.601-11.605 (thermal insulation standards — mandatory in some jurisdictions, recommended in others)",
      maxOccupancyRegulation: "Municipal code and fire department inspection",
      notes: "Western Argentina (Mendoza, San Juan) is a high seismic zone — INPRES-CIRSOC regulations apply. Buenos Aires has moderate seismic requirements. Building permits through municipal Dirección de Obras.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No general restrictions on urban property. Rural land ownership by foreigners limited to 1,000 hectares (Ley 26.737 de Tierras). Border zones may require additional security clearance.",
      repatriationRestrictions: true,
      treatyProtections: "US-Argentina BIT; numerous BITs (though Argentina has a contentious arbitration history)",
      notes: "CRITICAL: Argentina has a history of capital controls (cepo cambiario). As of early 2026, recent liberalization under current government — but verify current exchange control status before investing. Profits and capital repatriation have historically been restricted or required central bank approval. Dollarized financial model mitigates currency risk but does not eliminate transfer risk. Consult current BCRA (Banco Central) regulations.",
    },
    labor: {
      minimumWage: "ARS 271,571/month (subject to frequent adjustments due to inflation; 2025 — verify current rate)",
      mandatoryBenefits: "Employer social security ~27% of gross; 13th salary (SAC/Aguinaldo — 2 half payments); 14-35 days vacation (by tenure); mandatory union obra social (health)",
      terminationRules: "Without cause: 1 month's salary per year of tenure (minimum 2 months). 30-60 day notice or pay in lieu. Labor courts strongly favor workers. Double indemnification decrees have been applied periodically.",
      unionPrevalence: "High. Sector unions (UTHGRA — Unión de Trabajadores del Turismo, Hoteleros y Gastronómicos de la República Argentina) are powerful. Collective bargaining agreements (CCT) set sector minimums well above legal minimum wage.",
      notes: "UTHGRA is one of Argentina's strongest unions. CCT 389/04 governs the hospitality sector. Total employer burden approximately 40-50% above base salary. Inflation-driven wage adjustments are frequent (quarterly or more). Payroll costs highly volatile in peso terms — dollar-adjusted modeling essential.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Ley Nacional de Turismo 25.997",
      "Ley de Contrato de Trabajo 20.744",
      "BCRA exchange control regulations",
      "UTHGRA CCT 389/04",
    ],
  },

  "SV": {
    country: "El Salvador",
    countryCode: "SV",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "CORSATUR (Corporación Salvadoreña de Turismo) registration, Municipal operating license",
      typicalTimeline: "1-3 months",
      renewalFrequency: "Annual",
      estimatedCost: "$300-$1,500",
      notes: "CORSATUR/MITUR handles tourism classification. Ley de Turismo (2005) governs the sector. Government has actively promoted tourism investment. Bitcoin (BTC) is legal tender alongside USD since 2021 — but practical hospitality operations remain USD-based.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "2-4 months",
      environmentalReviewRequired: true,
      historicPreservation: false,
      notes: "OPAMSS (Oficina de Planificación del Área Metropolitana de San Salvador) governs zoning in the capital region. Environmental permit required from MARN (Ministerio de Medio Ambiente y Recursos Naturales). Outside AMSS, municipal planning rules apply.",
    },
    buildingCodes: {
      fireCodeStandard: "Ley de Urbanismo y Construcción; references NFPA standards; limited enforcement outside urban areas",
      adaEquivalent: "Ley de Equiparación de Oportunidades para las Personas con Discapacidad (2000); limited enforcement",
      seismicRequirements: true,
      energyEfficiencyCode: "No mandatory energy efficiency code",
      maxOccupancyRegulation: "Municipal and fire department assessment",
      notes: "El Salvador is highly seismically active. Norma Especial para Diseño y Construcción (post-2001 earthquakes) applies. Volcanic activity is also a consideration. Construction quality varies significantly — professional engineering oversight essential.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions on foreign ownership. Ley de Inversiones (1999) guarantees equal treatment. PROESA (export/investment promotion agency) facilitates investment.",
      repatriationRestrictions: false,
      treatyProtections: "CAFTA-DR (with US); US-El Salvador BIT",
      notes: "Dollarized economy (since 2001) eliminates currency risk for USD-denominated investors. Tax incentives available for tourism under Ley de Turismo. Generally investor-friendly regulatory environment.",
    },
    labor: {
      minimumWage: "$365/month for commerce and services sector (2024 — verify current rate)",
      mandatoryBenefits: "ISSS (health — employer 7.5%), AFP (pension — employer 7.75%), aguinaldo (15 days' salary), vacation bonus (30% premium on 15 vacation days)",
      terminationRules: "Just cause or unjust termination with indemnización (30 days' salary per year of service, no cap). Notice period required.",
      unionPrevalence: "Low in hospitality.",
      notes: "Total employer burden approximately 20-25% above base salary. Relatively lower labor costs than other Central American countries. 44-hour workweek standard.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Ley de Turismo de El Salvador (2005)",
      "Código de Trabajo de El Salvador",
      "CAFTA-DR text",
      "https://www.proesa.gob.sv/",
    ],
  },

  "PA": {
    country: "Panama",
    countryCode: "PA",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "ATP (Autoridad de Turismo de Panamá) registration, Aviso de Operación (municipal), Ministry of Health (MINSA) permit",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Annual",
      estimatedCost: "$500-$2,000",
      notes: "Law 80 of 2012 (Tourism Master Plan) provides substantial incentives. ATP classifies hotels. Zona Libre de Colón has special business rules. Panama City and beach resort areas have streamlined tourism licensing.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "2-6 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "MIVIOT (Ministerio de Vivienda y Ordenamiento Territorial) oversees zoning. Environmental impact assessment through MiAMBIENTE. Casco Antiguo (Panama City old town) is UNESCO World Heritage — strict heritage controls under Oficina del Casco Antiguo.",
    },
    buildingCodes: {
      fireCodeStandard: "REP (Reglamento Estructural Panameño); Cuerpo de Bomberos regulations; NFPA referenced",
      adaEquivalent: "Ley 42 de 1999 (accessibility for persons with disabilities)",
      seismicRequirements: true,
      energyEfficiencyCode: "JTIA (Junta Técnica de Ingeniería y Arquitectura) standards; no specific energy code for existing buildings",
      maxOccupancyRegulation: "Bomberos inspection and JTIA-approved plans",
      notes: "REP 2004 (updated) is the structural code. Panama is in a moderate seismic zone. All construction plans must be reviewed by JTIA-licensed professionals. High-rise construction is common in Panama City — different standards may apply.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions on foreign ownership of titled (finca) property. ROP (Derechos Posesorios) land has less secure title — titled property strongly recommended. 10km from border requires special permission.",
      repatriationRestrictions: false,
      treatyProtections: "US-Panama TPA (Trade Promotion Agreement); numerous BITs",
      notes: "Panama is a major investment hub. Territorial tax system — only Panama-source income is taxed. Tourism incentives under Law 80 include: 100% income tax exemption for 15 years on tourism activities, import duty exemptions on construction materials and equipment. Effectively dollarized (Balboa pegged 1:1 to USD). Very favorable investment climate.",
    },
    labor: {
      minimumWage: "$500-$700/month (varies by economic activity and region; tourism sector rates)",
      mandatoryBenefits: "CSS (Caja de Seguro Social — employer 12.25%), 13th month (paid in 3 installments), 30 days vacation/year, seniority premium (prima de antigüedad — 1 week/year)",
      terminationRules: "Just cause required for termination without severance. Unjust termination: seniority premium + indemnización (3.4 weeks' salary per year of service). Reinstatement can be ordered.",
      unionPrevalence: "Low in hospitality.",
      notes: "Total employer burden approximately 20-25% above base salary. 13th month paid in thirds (April, August, December). Relatively flexible labor market by Latin American standards.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Ley 80 de 2012 (Tourism Law)",
      "Código de Trabajo de Panamá",
      "https://www.atp.gob.pa/",
      "US-Panama TPA text",
    ],
  },

  "UY": {
    country: "Uruguay",
    countryCode: "UY",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "MINTUR (Ministerio de Turismo) registration and classification, Municipal habilitación",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Annual",
      estimatedCost: "$500-$2,000",
      notes: "MINTUR classifies all accommodation establishments. Ley de Turismo 19.253 governs the sector. Uruguay is known for regulatory transparency and strong rule of law — licensing is relatively straightforward.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-6 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Municipal Intendencia governs zoning. DINAMA (Dirección Nacional de Medio Ambiente) environmental assessment required for tourism projects. Colonia del Sacramento has UNESCO heritage protections. Coastal development (especially Punta del Este area) has specific regulations.",
    },
    buildingCodes: {
      fireCodeStandard: "Dirección Nacional de Bomberos regulations; municipal fire safety codes",
      adaEquivalent: "Ley 18.651 (Protección Integral de Personas con Discapacidad, 2010)",
      seismicRequirements: false,
      energyEfficiencyCode: "No mandatory energy efficiency code for existing buildings; emerging standards for new construction",
      maxOccupancyRegulation: "Bomberos (fire department) and municipal inspection",
      notes: "Uruguay has low seismic risk. Building permits through municipal Intendencia. Construction standards are generally high but vary by municipality. Professional engineering/architecture sign-off required.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions on foreign ownership. Equal treatment guaranteed by constitution. No minimum investment requirements.",
      repatriationRestrictions: false,
      treatyProtections: "US-Uruguay BIT; MERCOSUR investment protocols; numerous BITs",
      notes: "Uruguay is considered the most stable and transparent market in South America. Free trade zones (Zonas Francas) offer tax benefits for qualifying activities. Investment promotion through Uruguay XXI. Strong property rights protection and independent judiciary. No exchange controls.",
    },
    labor: {
      minimumWage: "UYU 22,268/month (2025 — adjusted periodically)",
      mandatoryBenefits: "BPS (employer social security ~12.63%), aguinaldo (13th month — 2 half payments), 20 days vacation (increasing with tenure), sick leave",
      terminationRules: "No just cause requirement — employer can terminate with notice and severance (despido común). Severance: 1 month per year of service up to 6 months. Minimal notice period.",
      unionPrevalence: "Moderate. PIT-CNT federation represents workers. Consejos de Salarios (tripartite wage councils) set sector minimums.",
      notes: "Uruguay's Consejos de Salarios system sets wages by sector through negotiation between government, employers, and unions. Hospitality sector (Grupo 14) has its own wage council. Total employer burden approximately 20-25% above base salary. Relatively flexible termination compared to other Latin American countries.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "Ley 19.253 (Tourism Law)",
      "https://www.gub.uy/ministerio-turismo/",
      "BPS regulations",
      "US-Uruguay BIT",
    ],
  },

  "PE": {
    country: "Peru",
    countryCode: "PE",
    licensing: {
      nationalLicenseRequired: true,
      localPermitRequired: true,
      licenseType: "MINCETUR (Ministerio de Comercio Exterior y Turismo) classification, Municipal Licencia de Funcionamiento",
      typicalTimeline: "2-4 months",
      renewalFrequency: "Municipal license varies; MINCETUR classification reviewed every 5 years",
      estimatedCost: "$300-$2,000",
      notes: "DS 001-2015-MINCETUR governs hotel classification (1-5 stars). DIRCETUR (regional tourism directorate) handles registration. Defensa Civil (civil defense) safety certification mandatory before operation.",
    },
    zoning: {
      residentialToCommercialAllowed: true,
      zoningChangeRequired: true,
      typicalZoningTimeline: "3-6 months",
      environmentalReviewRequired: true,
      historicPreservation: true,
      notes: "Municipal urban development plans govern zoning. SENACE (Servicio Nacional de Certificación Ambiental) handles environmental assessment for large projects. Ministerio de Cultura review required near archaeological sites (extremely common in Peru). Cusco historic center has strict UNESCO heritage controls.",
    },
    buildingCodes: {
      fireCodeStandard: "Reglamento Nacional de Edificaciones (RNE) — Norma A.130 (fire safety); INDECI (civil defense) inspection",
      adaEquivalent: "Ley 29973 (Ley General de la Persona con Discapacidad); RNE Norma A.120 (accessibility)",
      seismicRequirements: true,
      energyEfficiencyCode: "No mandatory energy efficiency code; voluntary LEED/EDGE certification gaining traction",
      maxOccupancyRegulation: "INDECI (civil defense) determines occupancy through ITSE (Technical Safety Inspection)",
      notes: "Peru is in a very high seismic zone — RNE Norma E.030 (Diseño Sismorresistente) is strictly enforced. Lima, coastal areas, and Cusco are particularly vulnerable. ITSE (Inspección Técnica de Seguridad en Edificaciones) mandatory before obtaining operating license.",
    },
    foreignInvestment: {
      foreignOwnershipAllowed: true,
      ownershipRestrictions: "No restrictions on foreign ownership of urban property. Within 50km of borders, foreigners cannot directly own property (constitutional restriction) — but may hold through a Peruvian company.",
      repatriationRestrictions: false,
      treatyProtections: "US-Peru TPA (Trade Promotion Agreement, 2009); numerous BITs",
      notes: "Peru has an open investment regime. Foreign investment registered with ProInversión. Tax stability agreements available for large investments (>$10M). Alcabala (property transfer tax) 3% of sale price. Peru's free trade agreement with the US provides strong investment protections.",
    },
    labor: {
      minimumWage: "PEN 1,130/month (2025 — adjusted periodically)",
      mandatoryBenefits: "EsSalud (health — employer 9%), CTS (Compensación por Tiempo de Servicios — ~1 month/year deposited biannually), gratificaciones (2 extra salary payments July + December), vacation (30 days), profit sharing (8% of pre-tax profits for hospitality sector)",
      terminationRules: "Just cause required for termination of indefinite contracts. Arbitrary dismissal: indemnización of 1.5 months' salary per year (capped at 12 months). Fixed-term contracts widely used but regulated.",
      unionPrevalence: "Low to moderate in hospitality.",
      notes: "Profit sharing (participación de utilidades) at 8% for hospitality sector is mandatory and a significant cost. CTS accrual adds approximately 1 month's salary per year. Total employer burden approximately 40-50% above base salary. Small enterprise regime (microempresa/pequeña empresa) offers reduced labor benefits for qualifying businesses.",
    },
    lastUpdated: "2026-04-13",
    sources: [
      "DS 001-2015-MINCETUR (Hotel Classification)",
      "Reglamento Nacional de Edificaciones (RNE)",
      "Ley General de la Persona con Discapacidad 29973",
      "US-Peru TPA text",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Country code mapping (country name → ISO 2-letter code)
// ─────────────────────────────────────────────────────────────────────────────

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "United States": "US",
  "Colombia": "CO",
  "Mexico": "MX",
  "United Kingdom": "GB",
  "Costa Rica": "CR",
  "Canada": "CA",
  "France": "FR",
  "Spain": "ES",
  "Italy": "IT",
  "Brazil": "BR",
  "Dominican Republic": "DO",
  "Portugal": "PT",
  "Greece": "GR",
  "Argentina": "AR",
  "El Salvador": "SV",
  "Panama": "PA",
  "Uruguay": "UY",
  "Peru": "PE",
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the regulatory profile for a country by ISO 2-letter code or country name.
 * Returns null if not found.
 */
export function getRegulatoryProfile(countryCodeOrName: string): RegulatoryProfile | null {
  // Try direct code lookup first
  if (REGULATORY_PROFILES[countryCodeOrName]) {
    return REGULATORY_PROFILES[countryCodeOrName];
  }
  // Try name → code mapping
  const code = COUNTRY_NAME_TO_CODE[countryCodeOrName];
  if (code && REGULATORY_PROFILES[code]) {
    return REGULATORY_PROFILES[code];
  }
  return null;
}

/**
 * Get all regulatory profiles as an array.
 */
export function getAllRegulatoryProfiles(): RegulatoryProfile[] {
  return Object.values(REGULATORY_PROFILES);
}

/**
 * Build a concise regulatory context block for inclusion in LLM research prompts.
 * Returns an empty string if no profile is found.
 */
export function buildRegulatoryContextBlock(countryCodeOrName: string): string {
  const profile = getRegulatoryProfile(countryCodeOrName);
  if (!profile) return "";

  const conversionStatus = profile.zoning.residentialToCommercialAllowed
    ? (profile.zoning.zoningChangeRequired ? "allowed with zoning change" : "allowed")
    : "restricted — consult local counsel";

  const foreignStatus = profile.foreignInvestment.foreignOwnershipAllowed
    ? (profile.foreignInvestment.ownershipRestrictions.length > 50
        ? "allowed with restrictions"
        : "allowed, no major restrictions")
    : "restricted";

  let block = `\nRegulatory Context (${profile.country}):`;
  block += `\n- Licensing: ${profile.licensing.licenseType}, timeline ${profile.licensing.typicalTimeline}`;
  block += `\n- Zoning: Residential-to-commercial conversion ${conversionStatus} (timeline: ${profile.zoning.typicalZoningTimeline})`;
  block += `\n- Building codes: Fire safety per ${profile.buildingCodes.fireCodeStandard.split(";")[0]}; seismic requirements: ${profile.buildingCodes.seismicRequirements ? "yes" : "no"}`;
  block += `\n- Foreign investment: ${foreignStatus}${profile.foreignInvestment.repatriationRestrictions ? " — repatriation restrictions apply" : ""}`;
  block += `\n- Labor: Minimum wage ${profile.labor.minimumWage.split("(")[0].trim()}; union prevalence: ${profile.labor.unionPrevalence.toLowerCase()}`;

  if (profile.foreignInvestment.treatyProtections) {
    block += `\n- Treaty protections: ${profile.foreignInvestment.treatyProtections}`;
  }
  if (profile.foreignInvestment.notes) {
    block += `\n- Investment note: ${profile.foreignInvestment.notes.slice(0, 200)}`;
  }

  return block;
}
