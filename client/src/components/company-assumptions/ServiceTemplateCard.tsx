import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Check, X, ChevronDown, ChevronUp } from "@/components/icons/themed-icons";
import { IconPencil, IconTrash, IconPackage, IconBookOpen } from "@/components/icons";
import type { ServiceTemplate } from "@shared/schema";
import { ServiceResearchPanel } from "./ServiceResearchPanel";

export const SERVICE_HELP: Record<string, string> = {
  "Marketing & Brand":
    "Brand strategy, franchise/brand fees, digital marketing campaigns, social media management, content creation, OTA channel management (Booking.com, Expedia), SEO/SEM, reputation monitoring, loyalty program management, and public relations. Per USALI 12th Edition Schedule 16 (Annual Mandatory Brand and Operator Costs), centralized marketing leverages group purchasing power for ad spend and brand-wide campaigns. Includes the brand/franchise component that is mandatory for all branded properties. Charged as a percentage of Total Revenue.",
  "Technology & Reservations":
    "Property Management System (PMS), booking engine, Wi-Fi infrastructure, cybersecurity, help desk support, system integrations (POS, key systems, kiosk/mobile check-in), cloud services, Central Reservation System (CRS), call center operations, group booking coordination, and channel distribution strategy. Per USALI 12th Edition, technology costs are recognized as a distinct undistributed expense category. Centralizing technology and reservations provides economies of scale and consistent standards across properties. Charged as a percentage of Total Revenue.",
  "Accounting":
    "Financial reporting per USALI 12th Edition standards, general ledger maintenance, accounts payable/receivable, bank reconciliations, audit preparation, tax filing support, budgeting assistance, internal controls, and owner reporting packages. Includes compliance with current hospitality accounting standards and regulatory requirements. Charged as a percentage of Total Revenue.",
  "Revenue Management":
    "Dynamic pricing strategy, rate and yield management, demand forecasting, competitive set analysis (STR benchmarking), revenue management analytics, total revenue management (TRevPAR optimization), and distribution channel optimization. Per USALI 12th Edition, revenue management is recognized as a critical discipline for maximizing property performance. Charged as a percentage of Total Revenue.",
  "General Management":
    "Executive oversight, strategic planning, human resources (recruitment, training, compliance), quality assurance inspections, brand standards enforcement, and operational consulting. Per USALI 12th Edition Schedule 16, this encompasses the operator's core management oversight function. This is typically a 'direct' service where the management company earns an oversight fee. Charged as a percentage of Total Revenue.",
  "Procurement":
    "Centralized purchasing, vendor negotiation, supply chain management, group purchasing organization (GPO) coordination, contract management, and cost optimization across the portfolio. Per USALI 12th Edition, procurement activities are tracked under Administrative & General or as a separate operator cost. Leverages group purchasing power for better pricing on FF&E, OS&E, and operating supplies. Charged as a percentage of Total Revenue.",
};

/**
 * Normalize a service-category name for help-text lookup: lowercase, strip
 * non-alphanumeric characters, collapse whitespace. Makes minor admin renames
 * ("Marketing & Brand" → "Marketing and Brand", different spacing, different
 * casing) still resolve to the right canonical help entry. A full rename that
 * changes the semantic meaning still returns null and the tooltip hides
 * gracefully. Proper fix is a `description` column on company_service_templates
 * — see audit task #7.
 */
const normalizeHelpKey = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const NORMALIZED_SERVICE_HELP: Record<string, string> = Object.fromEntries(
  Object.entries(SERVICE_HELP).map(([k, v]) => [normalizeHelpKey(k), v]),
);

function lookupServiceHelp(templateName: string): string | undefined {
  return SERVICE_HELP[templateName] ?? NORMALIZED_SERVICE_HELP[normalizeHelpKey(templateName)];
}

interface ServiceTemplateCardProps {
  template: ServiceTemplate;
  expandedDescriptions: Set<number>;
  expandedResearch: Set<number>;
  inlineEditingRate: number | null;
  inlineEditingMarkup: number | null;
  inlineRateValue: string;
  inlineMarkupValue: string;
  updatePending: boolean;
  onToggleActive: (t: ServiceTemplate) => void;
  onToggleDescription: (id: number) => void;
  onToggleResearch: (id: number) => void;
  onStartRateEdit: (t: ServiceTemplate) => void;
  onSaveRate: (id: number) => void;
  onCancelRate: () => void;
  onRateChange: (v: string) => void;
  onStartMarkupEdit: (t: ServiceTemplate) => void;
  onSaveMarkup: (id: number) => void;
  onCancelMarkup: () => void;
  onMarkupChange: (v: string) => void;
  onEdit: (t: ServiceTemplate) => void;
  onDelete: (id: number) => void;
}

export function ServiceTemplateCard({
  template: t,
  expandedDescriptions,
  expandedResearch,
  inlineEditingRate,
  inlineEditingMarkup,
  inlineRateValue,
  inlineMarkupValue,
  updatePending,
  onToggleActive,
  onToggleDescription,
  onToggleResearch,
  onStartRateEdit,
  onSaveRate,
  onCancelRate,
  onRateChange,
  onStartMarkupEdit,
  onSaveMarkup,
  onCancelMarkup,
  onMarkupChange,
  onEdit,
  onDelete,
}: ServiceTemplateCardProps) {
  const helpText = lookupServiceHelp(t.name);
  const isDescExpanded = expandedDescriptions.has(t.id);
  const descTruncateLength = 120;
  const needsTruncation = helpText && helpText.length > descTruncateLength;
  const isResearchExpanded = expandedResearch.has(t.id);
  const isEditingRate = inlineEditingRate === t.id;
  const isEditingMarkup = inlineEditingMarkup === t.id;

  return (
    <div
      className={`rounded-xl border border-border/80 overflow-hidden transition-opacity ${!t.isActive ? "opacity-50" : ""}`}
      data-testid={`service-template-${t.id}`}
    >
      <div className="p-4 pb-3 bg-muted/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-card border border-border/60 shrink-0">
              <IconPackage className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground text-base">{t.name}</span>
                <Badge variant={t.serviceModel === "centralized" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                  {t.serviceModel === "centralized" ? "Centralized" : "Direct"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.serviceModel === "centralized" ? "Pass-through with markup" : "Oversight only — full fee as revenue"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={t.isActive} onCheckedChange={() => onToggleActive(t)} disabled={updatePending} data-testid={`toggle-service-${t.id}`} />
          </div>
        </div>
      </div>

      {helpText && (
        <div className="px-4 pt-3 pb-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {needsTruncation && !isDescExpanded ? helpText.slice(0, descTruncateLength) + "..." : helpText}
            {needsTruncation && (
              <Button type="button" variant="ghost" size="sm" className="ml-1 text-primary hover:text-primary/80 font-medium inline h-auto px-0 py-0" onClick={() => onToggleDescription(t.id)} data-testid={`button-toggle-desc-${t.id}`}>
                {isDescExpanded ? "show less" : "show more"}
              </Button>
            )}
          </p>
        </div>
      )}

      <div className="px-4 py-3">
        <div className={`grid gap-3 ${t.serviceModel === "centralized" ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Fee Rate</div>
            {isEditingRate ? (
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Input type="number" step="0.1" min="0" max="100" value={inlineRateValue} onChange={(e) => onRateChange(e.target.value)} className="h-8 text-sm font-mono pr-6" autoFocus onKeyDown={(e) => { if (e.key === "Enter") onSaveRate(t.id); if (e.key === "Escape") onCancelRate(); }} data-testid={`input-inline-rate-${t.id}`} />
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground text-xs">%</div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10" onClick={() => onSaveRate(t.id)} disabled={updatePending} data-testid={`button-save-inline-rate-${t.id}`}><Check className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onCancelRate()} data-testid={`button-cancel-inline-rate-${t.id}`}><X className="w-3.5 h-3.5" /></Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" className="flex items-center gap-1.5 group/rate cursor-pointer h-auto px-1 py-0.5" onClick={() => onStartRateEdit(t)} data-testid={`button-edit-inline-rate-${t.id}`}>
                <span className="text-lg font-bold font-mono text-foreground">{((t.defaultRate ?? 0) * 100).toFixed(1)}%</span>
                <span className="text-xs text-muted-foreground">of Revenue</span>
                <IconPencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/rate:opacity-100 transition-opacity" />
              </Button>
            )}
          </div>

          {t.serviceModel === "centralized" && (
            <div className="bg-primary/10 dark:bg-primary/15 border border-primary/30 dark:border-primary/40 rounded-lg p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Cost-Plus Markup
                <InfoTooltip text={`Centralized model: The management company procures this service from vendors and passes the cost through with a ${((t.serviceMarkup ?? 0) * 100).toFixed(0)}% markup. Effective margin: ${(((t.serviceMarkup ?? 0) / (1 + (t.serviceMarkup ?? 0))) * 100).toFixed(1)}% of fee revenue.`} />
              </div>
              {isEditingMarkup ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Input type="number" step="1" min="0" max="100" value={inlineMarkupValue} onChange={(e) => onMarkupChange(e.target.value)} className="h-8 text-sm font-mono pr-6" autoFocus onKeyDown={(e) => { if (e.key === "Enter") onSaveMarkup(t.id); if (e.key === "Escape") onCancelMarkup(); }} data-testid={`input-inline-markup-${t.id}`} />
                    <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground text-xs">%</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10" onClick={() => onSaveMarkup(t.id)} disabled={updatePending} data-testid={`button-save-inline-markup-${t.id}`}><Check className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onCancelMarkup()} data-testid={`button-cancel-inline-markup-${t.id}`}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" className="flex items-center gap-1.5 group/markup cursor-pointer h-auto px-1 py-0.5" onClick={() => onStartMarkupEdit(t)} data-testid={`button-edit-inline-markup-${t.id}`}>
                  <span className="text-lg font-bold font-mono text-foreground">{((t.serviceMarkup ?? 0) * 100).toFixed(0)}%</span>
                  <span className="text-xs text-muted-foreground">markup</span>
                  <IconPencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/markup:opacity-100 transition-opacity" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onEdit(t)} data-testid={`button-edit-service-${t.id}`}>
                <IconPencil className="w-3.5 h-3.5" />
                Edit
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p className="text-xs">Edit all service settings</p></TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onDelete(t.id)} data-testid={`button-delete-service-${t.id}`}>
            <IconTrash className="w-3.5 h-3.5 text-destructive" />
            Delete
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={() => onToggleResearch(t.id)} data-testid={`button-research-service-${t.id}`}>
          <IconBookOpen className="w-3.5 h-3.5" />
          Benchmarks
          {isResearchExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {isResearchExpanded && (
        <div className="px-4 pb-4">
          <ServiceResearchPanel template={t} />
        </div>
      )}
    </div>
  );
}
