/**
 * Regulatory insight generator — checks each property's country against
 * the regulatory profile and country-default tables for foreign-ownership
 * restrictions, country-risk premiums, and licensing timelines.
 */

import type { Property } from "@workspace/db";
import type { RiskInsight } from "@shared/risk-types";
import { getCountryDefaults } from "@shared/countryDefaults";
import { getRegulatoryProfile } from "@shared/regulatory-data";
import { pct, propertyEntity } from "./helpers";

export function generateRegulatoryInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];

  for (const p of properties) {
    const country = p.country;
    if (!country) continue;

    const profile = getRegulatoryProfile(country);
    const defaults = getCountryDefaults(country);
    if (!profile && !defaults) continue;

    // Foreign ownership restrictions
    if (profile && !profile.foreignInvestment.foreignOwnershipAllowed) {
      insights.push({
        category: "regulatory",
        severity: "critical",
        title: `Foreign ownership restricted in ${country}`,
        narrative: `${country} restricts foreign ownership of real property. ${profile.foreignInvestment.ownershipRestrictions}. This may require structuring the investment through a local entity or trust. Consult local counsel before committing capital.`,
        dataPoints: [
          { label: "Restriction", value: profile.foreignInvestment.ownershipRestrictions },
          { label: "Treaty Protections", value: profile.foreignInvestment.treatyProtections },
        ],
        actionItems: [
          "Engage local legal counsel for structuring advice",
          "Evaluate holding company or trust structures",
          "Verify repatriation rules for investment returns",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    } else if (profile && profile.foreignInvestment.ownershipRestrictions && profile.foreignInvestment.ownershipRestrictions !== "None") {
      insights.push({
        category: "regulatory",
        severity: "info",
        title: `Investment regulations in ${country}`,
        narrative: `${country} allows foreign ownership with conditions: ${profile.foreignInvestment.ownershipRestrictions}. ${profile.foreignInvestment.repatriationRestrictions ? "Note: there are repatriation restrictions on investment returns." : "No repatriation restrictions apply."}`,
        dataPoints: [
          { label: "Conditions", value: profile.foreignInvestment.ownershipRestrictions },
        ],
        actionItems: [
          "Review country-specific investment requirements with counsel",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // High country risk premium
    if (defaults && defaults.countryRiskPremium > 0.03) {
      insights.push({
        category: "regulatory",
        severity: "caution",
        title: `High country risk premium for ${country}`,
        narrative: `${country} carries a country risk premium of ${pct(defaults.countryRiskPremium)} (Damodaran). This reflects elevated political, economic, or currency risks that affect the required return on equity. Investors should demand commensurately higher projected returns for this market.`,
        dataPoints: [
          { label: "CRP", value: pct(defaults.countryRiskPremium), benchmark: "<3.0%", delta: `+${pct(defaults.countryRiskPremium - 0.03)}` },
          { label: "Tax Rate", value: pct(defaults.taxRate) },
        ],
        actionItems: [
          "Ensure projected IRR compensates for the additional country risk",
          "Consider political risk insurance for this jurisdiction",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // Licensing timeline
    if (profile && profile.licensing.typicalTimeline) {
      const months = parseInt(profile.licensing.typicalTimeline, 10);
      if (!isNaN(months) && months > 6) {
        insights.push({
          category: "regulatory",
          severity: "info",
          title: `Licensing timeline in ${country}`,
          narrative: `Hospitality licensing in ${country} typically takes ${profile.licensing.typicalTimeline}. Factor this into your ramp-up timeline and pre-opening budget. Delays are common and can extend the period of negative cash flow.`,
          dataPoints: [
            { label: "Timeline", value: profile.licensing.typicalTimeline },
            { label: "License Type", value: profile.licensing.licenseType },
          ],
          actionItems: [
            "Begin licensing process immediately upon acquisition",
            "Budget for pre-opening costs during the licensing period",
          ],
          affectedEntities: [propertyEntity(p)],
        });
      }
    }
  }

  return insights;
}
