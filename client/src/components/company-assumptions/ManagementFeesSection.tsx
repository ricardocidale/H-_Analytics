import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconPlus, IconSave, IconInfo, IconPercent, IconDollarSign, IconArrowRightLeft,
  IconPackage, IconTrending,
} from "@/components/icons";
import {
  useServiceTemplates,
  useCreateServiceTemplate,
  useUpdateServiceTemplate,
  useDeleteServiceTemplate,
  useSyncServiceTemplates,
} from "@/lib/api/services";
import { useGlobalAssumptions, useUpdateGlobalAssumptions } from "@/lib/api";
import type { ServiceTemplate } from "@shared/schema";
import type { ManagementFeesSectionProps } from "./types";
import { ServiceTemplateDialog, type FormState, emptyForm } from "./ServiceTemplateDialog";
import { PropertyFeeSummaryTable } from "./PropertyFeeSummaryTable";
import { ServiceTemplateCard } from "./ServiceTemplateCard";

function formFromTemplate(t: ServiceTemplate): FormState {
  return {
    name: t.name,
    defaultRate: ((t.defaultRate ?? 0) * 100).toFixed(1),
    serviceModel: t.serviceModel as "centralized" | "direct",
    serviceMarkup: ((t.serviceMarkup ?? 0) * 100).toFixed(0),
    isActive: t.isActive,
    sortOrder: String(t.sortOrder),
  };
}

export default function ManagementFeesSection({ properties, allFeeCategories, researchValues }: ManagementFeesSectionProps) {
  const { toast } = useToast();

  const { data: templates, isLoading: templatesLoading } = useServiceTemplates();
  const createMutation = useCreateServiceTemplate();
  const updateMutation = useUpdateServiceTemplate();
  const deleteMutation = useDeleteServiceTemplate();
  const syncMutation = useSyncServiceTemplates();

  const { data: globalAssumptions } = useGlobalAssumptions();
  const updateGlobalMutation = useUpdateGlobalAssumptions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [expandedResearch, setExpandedResearch] = useState<Set<number>>(new Set());
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  const [inlineEditingRate, setInlineEditingRate] = useState<number | null>(null);
  const [inlineEditingMarkup, setInlineEditingMarkup] = useState<number | null>(null);
  const [inlineRateValue, setInlineRateValue] = useState("");
  const [inlineMarkupValue, setInlineMarkupValue] = useState("");

  const [incentivePct, setIncentivePct] = useState<string>("");
  const [incentiveDirty, setIncentiveDirty] = useState(false);

  const currentIncentive = globalAssumptions?.incentiveManagementFee ?? 0;
  const displayIncentive = incentiveDirty ? incentivePct : (currentIncentive * 100).toFixed(1);

  const toggleResearch = (id: number) => {
    setExpandedResearch(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleDescription = (id: number) => {
    setExpandedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startInlineRateEdit = (t: ServiceTemplate) => {
    setInlineEditingRate(t.id);
    setInlineRateValue(((t.defaultRate ?? 0) * 100).toFixed(1));
  };

  const startInlineMarkupEdit = (t: ServiceTemplate) => {
    setInlineEditingMarkup(t.id);
    setInlineMarkupValue(((t.serviceMarkup ?? 0) * 100).toFixed(0));
  };

  const saveInlineRate = (id: number) => {
    const rate = parseFloat(inlineRateValue) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast({ title: "Rate must be between 0% and 100%", variant: "destructive" });
      return;
    }
    updateMutation.mutate(
      { id, data: { defaultRate: rate } },
      {
        onSuccess: () => { toast({ title: "Fee rate updated" }); setInlineEditingRate(null); },
        onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const saveInlineMarkup = (id: number) => {
    const markup = parseFloat(inlineMarkupValue) / 100;
    if (isNaN(markup) || markup < 0 || markup > 1) {
      toast({ title: "Markup must be between 0% and 100%", variant: "destructive" });
      return;
    }
    updateMutation.mutate(
      { id, data: { serviceMarkup: markup } },
      {
        onSuccess: () => { toast({ title: "Markup updated" }); setInlineEditingMarkup(null); },
        onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sortOrder: String((templates?.length ?? 0) + 1) });
    setDialogOpen(true);
  };

  const openEdit = (t: ServiceTemplate) => {
    setEditingId(t.id);
    setForm(formFromTemplate(t));
    setDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    const rate = parseFloat(form.defaultRate) / 100;
    const markup = parseFloat(form.serviceMarkup) / 100;
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (isNaN(rate) || rate < 0 || rate > 1) { toast({ title: "Rate must be between 0% and 100%", variant: "destructive" }); return; }
    if (isNaN(markup) || markup < 0 || markup > 1) { toast({ title: "Markup must be between 0% and 100%", variant: "destructive" }); return; }

    const payload = {
      name: form.name.trim(),
      defaultRate: rate,
      serviceModel: form.serviceModel,
      serviceMarkup: markup,
      isActive: form.isActive,
      sortOrder: parseInt(form.sortOrder) || 0,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => { toast({ title: "Service template saved" }); setDialogOpen(false); },
          onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => { toast({ title: "Service template created" }); setDialogOpen(false); },
        onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => { toast({ title: "Service template deleted" }); setDeleteConfirmId(null); },
      onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data: { message: string }) => { toast({ title: "Sync complete", description: data.message }); },
      onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleToggleActive = (t: ServiceTemplate) => {
    updateMutation.mutate(
      { id: t.id, data: { isActive: !t.isActive } },
      {
        onSuccess: () => toast({ title: `${t.name} ${t.isActive ? "deactivated" : "activated"}` }),
        onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleSaveIncentive = () => {
    const pct = parseFloat(incentivePct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: "Incentive fee must be between 0% and 100%", variant: "destructive" });
      return;
    }
    updateGlobalMutation.mutate(
      { incentiveManagementFee: pct / 100 },
      { onSuccess: () => { setIncentiveDirty(false); toast({ title: "Saved", description: "Incentive management fee saved." }); } }
    );
  };

  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  const sorted = [...(templates ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const activeTemplates = sorted.filter(t => t.isActive);
  const totalServiceRate = activeTemplates.reduce((sum, t) => sum + (t.defaultRate ?? 0), 0);
  const centralizedCount = activeTemplates.filter(t => t.serviceModel === "centralized").length;
  const directCount = activeTemplates.filter(t => t.serviceModel === "direct").length;

  if (templatesLoading) {
    return (
      <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm space-y-6">
      <div>
        <h3 className="text-lg font-display text-foreground flex items-center gap-2">
          Revenue Model — Service Categories & Fees
          <InfoTooltip text="Define the service categories and fee structure that drive management company revenue. Service categories are charged as a % of each property's Total Revenue. The Incentive Fee is a performance bonus on GOP. HVS 2024 Fee Survey: Luxury/Upper Upscale operators command 3–5% base + 10–15% incentive; specialty/wellness operators 6–10% base + 12–20% incentive. Lodge/VRBO models use all-in management fees (15–35%) instead. Values set here are defaults — each property can override them." manualSection="company-formulas" />
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the services provided to properties and the fee structure for each.
        </p>
      </div>

      <Alert className="bg-primary/5 border-primary/20">
        <IconInfo className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary font-semibold">How Revenue Streams Work</AlertTitle>
        <AlertDescription className="text-primary/80 space-y-2">
          <p>The management company earns revenue through two types of fees charged to each property:</p>
          <p><strong>Service Fees</strong> (Base Management Fee) — a set of named service categories, each charged as a percentage of the property's Total Revenue. The sum of all active service categories equals the total Base Management Fee.</p>
          <p><strong>Incentive Fee</strong> — a performance bonus charged as a percentage of Gross Operating Profit (GOP), only collected when GOP is positive.</p>
          <p className="text-xs italic">Together, these fees are deducted from NOI in the USALI waterfall: Revenue → GOP → Fixed Charges → NOI → Mgmt Fees → FF&E → ANOI. Values set here are defaults — each property can override them individually.</p>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-muted border border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-display font-bold text-foreground">{activeTemplates.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active Services</div>
          </CardContent>
        </Card>
        <Card className="bg-muted border border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-display font-bold text-primary">{(totalServiceRate * 100).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Total Base Fee (of Revenue)</div>
          </CardContent>
        </Card>
        <Card className="bg-muted border border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-display font-bold text-foreground">{centralizedCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Centralized (pass-through)</div>
          </CardContent>
        </Card>
        <Card className="bg-muted border border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-display font-bold text-foreground">{directCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Direct (oversight only)</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <IconPackage className="w-4 h-4 text-muted-foreground" />
                Service Categories
                <InfoTooltip text="Each category represents a specific service the management company provides to properties. The fee for each category is charged as a percentage of the property's Total Revenue. Together, all active categories sum to the Base Management Fee. Properties inherit these defaults but can customize rates individually." />
              </CardTitle>
              <CardDescription className="label-text">
                Toggle services ON/OFF to include or exclude them globally for all properties.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={syncMutation.isPending} data-testid="button-sync-templates">
                    {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <IconArrowRightLeft className="w-4 h-4 mr-1" />}
                    Sync to Properties
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="max-w-xs text-xs">Propagate new service categories to all existing properties. Does not overwrite existing property-level categories or rates.</p>
                </TooltipContent>
              </Tooltip>
              <Button size="sm" onClick={openCreate} data-testid="button-add-service">
                <IconPlus className="w-4 h-4 mr-1" />
                Add Service
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IconPackage className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">No service templates configured</p>
              <p className="text-sm mt-1">Add service categories to define what the management company provides to properties.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {sorted.map((t) => (
                <ServiceTemplateCard
                  key={t.id}
                  template={t}
                  expandedDescriptions={expandedDescriptions}
                  expandedResearch={expandedResearch}
                  inlineEditingRate={inlineEditingRate}
                  inlineEditingMarkup={inlineEditingMarkup}
                  inlineRateValue={inlineRateValue}
                  inlineMarkupValue={inlineMarkupValue}
                  updatePending={updateMutation.isPending}
                  onToggleActive={handleToggleActive}
                  onToggleDescription={toggleDescription}
                  onToggleResearch={toggleResearch}
                  onStartRateEdit={startInlineRateEdit}
                  onSaveRate={saveInlineRate}
                  onCancelRate={() => setInlineEditingRate(null)}
                  onRateChange={setInlineRateValue}
                  onStartMarkupEdit={startInlineMarkupEdit}
                  onSaveMarkup={saveInlineMarkup}
                  onCancelMarkup={() => setInlineEditingMarkup(null)}
                  onMarkupChange={setInlineMarkupValue}
                  onEdit={openEdit}
                  onDelete={setDeleteConfirmId}
                />
              ))}

              <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl lg:col-span-2">
                <div className="flex items-center gap-2">
                  <IconTrending className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">Total Base Management Fee</span>
                  <InfoTooltip text="The sum of all active service category rates. This is the effective Base Management Fee charged to each property as a percentage of their Total Revenue. It is deducted from NOI to calculate ANOI in the USALI waterfall." />
                </div>
                <span className="text-lg font-display font-bold text-primary font-mono">{(totalServiceRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <IconDollarSign className="w-4 h-4 text-muted-foreground" />
            Incentive Management Fee
            <InfoTooltip text="A performance-based fee calculated as a percentage of Gross Operating Profit (GOP). Only collected when GOP is positive — if a property has a negative GOP, no incentive fee is charged. HVS 2024 Fee Survey: specialty/wellness operators typically charge 12–20% of GOP as incentive fee. Combined with the Base Management Fee (service categories above), these two fee types are deducted from NOI to arrive at ANOI per the USALI 12th Ed. standard." />
          </CardTitle>
          <CardDescription className="label-text">
            Performance bonus as a percentage of each property's Gross Operating Profit (GOP). Only charged when GOP is positive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4 max-w-md">
            <div className="space-y-2 flex-1">
              <ResearchContextFieldLabel
                label={<><IconPercent className="w-3 h-3 inline" /> Default Incentive Fee</>}
                badgeProps={{ value: researchValues.incentiveManagementFee?.display, sourceType: "industry", sourceName: "HVS 2024 Fee Survey", "data-testid": "badge-incentive-fee" }}
                onApplyValue={() => {
                  if (researchValues.incentiveManagementFee) {
                    setIncentivePct(String(researchValues.incentiveManagementFee.mid));
                    setIncentiveDirty(true);
                  }
                }}
                guidanceContext={gc("incentiveManagementFee", "Incentive Management Fee")}
                className="label-text text-foreground"
              />
              <div className="relative">
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={displayIncentive}
                  onChange={(e) => { setIncentivePct(e.target.value); setIncentiveDirty(true); }}
                  placeholder="12" className="bg-card pr-8"
                  data-testid="input-incentive-management-fee"
                />
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground text-sm">%</div>
              </div>
              <p className="text-[10px] text-muted-foreground italic">e.g. 12 for 12% of GOP. Industry range: 10–20%.</p>
            </div>
            <Button onClick={handleSaveIncentive} disabled={!incentiveDirty || updateGlobalMutation.isPending} data-testid="button-save-incentive">
              {updateGlobalMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <IconSave className="w-4 h-4 mr-1" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <PropertyFeeSummaryTable properties={properties} allFeeCategories={allFeeCategories} />

      <ServiceTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        form={form}
        setForm={setForm}
        onSave={handleSaveTemplate}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Delete Service Category</DialogTitle>
            <DialogDescription className="label-text">
              This will remove the service category from the company template. Existing property fee categories will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-service"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
