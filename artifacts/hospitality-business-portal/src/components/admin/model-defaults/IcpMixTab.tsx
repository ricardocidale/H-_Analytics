/**
 * IcpMixTab.tsx — Admin wrapper for the ICP Bracket Mix editor.
 *
 * Renders IcpMixContent (from CompanyBracketMix) without the page-level
 * Layout / PageHeader wrapper, so it fits as a sub-tab under Admin →
 * Management Co. between "Company" and "Capital Stack Discipline".
 */
import { IcpMixContent } from "@/pages/CompanyBracketMix";

export function IcpMixTab() {
  return <IcpMixContent />;
}
