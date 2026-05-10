import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Check, X, ChevronDown, ChevronUp, ChevronRight } from "@/components/icons/themed-icons";
import { IconPencil, IconTrash, IconPackage, IconBookOpen } from "@/components/icons";
import { cn } from "@/lib/utils";
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
  expandedRows: Set<number>;
  expandedResearch: Set<number>;
  inlineEditingRate: number | null;
  inlineEditingMarkup: number | null;
  inlineRateValue: string;
  inlineMarkupValue: string;
  updatePending: boolean;
  onToggleActive: (t: ServiceTemplate) => void;
  onToggleRow: (id: number) => void;
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
  expandedRows,
  expandedResearch,
  inlineEditingRate,
  inlineEditingMarkup,
  inlineRateValue,
  inlineMarkupValue,
  updatePending,
  onToggleActive,
  onToggleRow,
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
  const isExpanded = expandedRows.has(t.id);
  const isResearchExpanded = expandedResearch.has(t.id);
  const isEditingRate = inlineEditingRate === t.id;
  const isEditingMarkup = inlineEditingMarkup === t.id;
  const ratePct = ((t.defaultRate ?? 0) * 100).toFixed(1);
  const markupPct = ((t.serviceMarkup ?? 0) * 100).toFixed(0);

  return (
    <div
      className={cn(
        "border border-border/80 rounded-lg overflow-hidden transition-opacity bg-card",
        !t.isActive && "opacity-50",
      )}
      data-testid={`service-template-${t.id}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onToggleRow(t.id)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-md hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`button-toggle-row-${t.id}`}
          aria-expanded={isExpanded}
          aria-controls={`service-row-body-${t.id}`}
        >
          <ChevronRight
            className={cn(
              "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
              isExpanded && "rotate-90",
            )}
          />
          <IconPackage className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-semibold text-foreground truncate">{t.name}</span>
          <Badge
            variant={t.serviceModel === "centralized" ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0 shrink-0"
          >
            {t.serviceModel === "centralized" ? "Centralized" : "Direct"}
          </Badge>
        </button>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-mono font-bold text-foreground tabular-nums">
            {ratePct}%
          </span>
          {t.serviceModel === "centralized" && (
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              +{markupPct}%
            </span>
          )}
          <Switch
            checked={t.isActive}
            onCheckedChange={() => onToggleActive(t)}
            disabled={updatePending}
            data-testid={`toggle-service-${t.id}`}
          />
        </div>
      </div>

      {isExpanded && (
        <div
          id={`service-row-body-${t.id}`}
          className="border-t border-border/60 bg-muted/20 px-4 py-4 space-y-4"
        >
          <p className="text-xs text-muted-foreground">
            {t.serviceModel === "centralized"
              ? "Pass-through with markup"
              : "Oversight only — full fee as revenue"}
          </p>

          {helpText && (
            <p className="text-xs text-muted-foreground leading-relaxed">{helpText}</p>
          )}

          <div
            className={cn(
              "grid gap-3",
              t.serviceModel === "centralized"
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1",
            )}
          >
            <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Fee Rate
              </div>
              {isEditingRate ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={inlineRateValue}
                      onChange={(e) => onRateChange(e.target.value)}
                      className="h-8 text-sm font-mono pr-6"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSaveRate(t.id);
                        if (e.key === "Escape") onCancelRate();
                      }}
                      data-testid={`input-inline-rate-${t.id}`}
                    />
                    <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground text-xs">
                      %
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => onSaveRate(t.id)}
                    disabled={updatePending}
                    data-testid={`button-save-inline-rate-${t.id}`}
                    aria-label="Save rate"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onCancelRate()}
                    data-testid={`button-cancel-inline-rate-${t.id}`}
                    aria-label="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="flex items-center gap-1.5 group/rate cursor-pointer h-auto px-1 py-0.5"
                  onClick={() => onStartRateEdit(t)}
                  data-testid={`button-edit-inline-rate-${t.id}`}
                >
                  <span className="text-lg font-bold font-mono text-foreground">
                    {ratePct}%
                  </span>
                  <span className="text-xs text-muted-foreground">of Revenue</span>
                  <IconPencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/rate:opacity-100 transition-opacity" />
                </Button>
              )}
            </div>

            {t.serviceModel === "centralized" && (
              <div className="bg-primary/10 dark:bg-primary/15 border border-primary/30 dark:border-primary/40 rounded-lg p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Cost-Plus Markup
                  <InfoTooltip
                    text={`Centralized model: The management company procures this service from vendors and passes the cost through with a ${markupPct}% markup. Effective margin: ${(((t.serviceMarkup ?? 0) / (1 + (t.serviceMarkup ?? 0))) * 100).toFixed(1)}% of fee revenue.`}
                  />
                </div>
                {isEditingMarkup ? (
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={inlineMarkupValue}
                        onChange={(e) => onMarkupChange(e.target.value)}
                        className="h-8 text-sm font-mono pr-6"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSaveMarkup(t.id);
                          if (e.key === "Escape") onCancelMarkup();
                        }}
                        data-testid={`input-inline-markup-${t.id}`}
                      />
                      <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground text-xs">
                        %
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => onSaveMarkup(t.id)}
                      disabled={updatePending}
                      data-testid={`button-save-inline-markup-${t.id}`}
                      aria-label="Save markup"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => onCancelMarkup()}
                      data-testid={`button-cancel-inline-markup-${t.id}`}
                      aria-label="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex items-center gap-1.5 group/markup cursor-pointer h-auto px-1 py-0.5"
                    onClick={() => onStartMarkupEdit(t)}
                    data-testid={`button-edit-inline-markup-${t.id}`}
                  >
                    <span className="text-lg font-bold font-mono text-foreground">
                      {markupPct}%
                    </span>
                    <span className="text-xs text-muted-foreground">markup</span>
                    <IconPencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/markup:opacity-100 transition-opacity" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => onEdit(t)}
                    data-testid={`button-edit-service-${t.id}`}
                  >
                    <IconPencil className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Edit all service settings</p>
                </TooltipContent>
              </Tooltip>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onDelete(t.id)}
                data-testid={`button-delete-service-${t.id}`}
              >
                <IconTrash className="w-3.5 h-3.5 text-destructive" />
                Delete
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5 text-muted-foreground"
              onClick={() => onToggleResearch(t.id)}
              data-testid={`button-research-service-${t.id}`}
            >
              <IconBookOpen className="w-3.5 h-3.5" />
              Benchmarks
              {isResearchExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>

          {isResearchExpanded && <ServiceResearchPanel template={t} />}
        </div>
      )}
    </div>
  );
}
