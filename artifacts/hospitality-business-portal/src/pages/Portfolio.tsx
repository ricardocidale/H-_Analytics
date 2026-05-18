/**
 * Portfolio.tsx — Portfolio overview page listing all managed hospitality properties.
 *
 * This page shows a card grid of every property in the system, sorted by
 * acquisition date. Each card links to the property detail page and displays
 * the property photo, name, location, and status badge.
 *
 * Adding a property:
 *   The "Add Property" button opens a dialog where the user fills in basic
 *   details (name, location, photo, dates, room count, ADR, capital structure).
 *   Default operating-cost rates and revenue-share percentages are applied from
 *   the constants module so a new property can produce reasonable pro-formas
 *   immediately. The user can refine these later on the PropertyEdit page.
 *
 * Operations start date auto-fill:
 *   When the user sets an acquisition date, if the operations start date is
 *   still blank, it auto-fills to 6 months later — a typical renovation timeline
 *   for a boutique hospitality property.
 *
 * Deleting a property removes it from the portfolio and triggers a full
 * invalidation of all financial queries so dashboards update.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PropertyStatus } from "@shared/constants";
import { BUSINESS_MODEL_DEFAULTS } from "@shared/constants-business-models";
import Layout from "@/components/Layout";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { PageErrorState } from "@/components/ui/page-error-state";
import { useProperties, useDeleteProperty, useCreateProperty, useGlobalAssumptions, useUpdateProperty, useAllPropertyUrls } from "@/lib/api";
import { IconPlus } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { InsertProperty } from "@shared/schema";
import {
  DEFAULT_ADR_GROWTH_RATE,
  DEFAULT_CATERING_BOOST_PCT,
} from "@/lib/constants";
import { PageTransition } from "@/components/ui/animated";
import { AnimatedPage, AnimatedGrid } from "@/components/graphics";
import { AddPropertyDialog, PortfolioPropertyCard } from "@/components/portfolio";
import type { AddPropertyFormData } from "@/components/portfolio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";

/** Utility: shift a YYYY-MM-DD date string forward by N months. */
function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const INITIAL_FORM_DATA: AddPropertyFormData = {
  name: "",
  location: "",
  market: "",
  imageUrl: "",
  status: PropertyStatus.PIPELINE,
  acquisitionDate: "",
  operationsStartDate: "",
  purchasePrice: 0,
  buildingImprovements: 0,
  preOpeningCosts: 0,
  operatingReserve: 0,
  roomCount: BUSINESS_MODEL_DEFAULTS.hotel.roomCount, // hotel baseline; user picks model later
  startAdr: 250, // starting ADR bootstrap; canonical source is model_defaults.mc.property_defaults.startAdr
  adrGrowthRate: DEFAULT_ADR_GROWTH_RATE,
  startOccupancy: 0.55, // starting occupancy bootstrap; canonical source is model_defaults.mc.property_defaults.startOccupancy
  maxOccupancy: 0.85, // stabilized-occupancy bootstrap; canonical source is model_defaults.mc.property_defaults.maxOccupancy
  occupancyRampMonths: 6, // ramp-up months bootstrap; canonical source is model_defaults.mc.property_defaults.occupancyRampMonths
  occupancyGrowthStep: 0.05, // monthly occupancy step bootstrap; canonical source is model_defaults.mc.property_defaults.occupancyGrowthStep
  type: "Full Equity",
  cateringBoostPercent: DEFAULT_CATERING_BOOST_PCT,
  country: "",
  stateProvince: "",
};

type PortfolioTab = "properties" | "map";

interface PortfolioItem {
  id: number;
  name: string;
}

export default function Portfolio() {
  const { data: properties, isLoading, isError } = useProperties();
  const { data: _global } = useGlobalAssumptions();
  const { data: allPropertyUrls = [] } = useAllPropertyUrls();
  const deleteProperty = useDeleteProperty();
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [_activeTab, _setActiveTab] = useState<PortfolioTab>("properties");
  const [formData, setFormData] = useState<AddPropertyFormData>({ ...INITIAL_FORM_DATA });
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);

  const { data: portfolios = [] } = useQuery<PortfolioItem[]>({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const r = await fetch("/api/portfolios", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch portfolios");
      return r.json() as Promise<PortfolioItem[]>;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ propertyId, portfolioId }: { propertyId: number; portfolioId: number }) => {
      const r = await fetch(`/api/properties/${propertyId}/portfolio`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ portfolioId }),
      });
      if (!r.ok) throw new Error("Failed to assign property");
      return r.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast({ title: "Property assigned", description: "Property has been added to the portfolio." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign property.", variant: "destructive" });
    },
  });

  const handleAcquisitionDateChange = (date: string) => {
    const updates: Partial<AddPropertyFormData> = { acquisitionDate: date };
    if (date && !formData.operationsStartDate) {
      updates.operationsStartDate = addMonths(date, 6);
    }
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateProperty.mutate({ id, data: { isActive } });
  };

  const handleDelete = (id: number, name: string) => {
    deleteProperty.mutate(id, {
      onSuccess: () => {
        toast({
          title: "Property Deleted",
          description: `${name} has been removed from the portfolio.`,
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: `Failed to delete ${name}.`,
          variant: "destructive",
        });
      }
    });
  };

  const resetForm = () => {
    setFormData({ ...INITIAL_FORM_DATA });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.location || !formData.imageUrl) {
      toast({
        title: "Missing Information",
        description: "Please fill in the property name, location, and upload a photo.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.acquisitionDate || !formData.operationsStartDate) {
      toast({
        title: "Missing Dates",
        description: "Please set both the acquisition date and operations start date.",
        variant: "destructive",
      });
      return;
    }

    if (formData.operationsStartDate < formData.acquisitionDate) {
      toast({
        title: "Invalid Dates",
        description: "Operations start date cannot be before the acquisition date.",
        variant: "destructive",
      });
      return;
    }

    const propertyData: InsertProperty = {
      ...formData,
      cateringBoostPercent: formData.cateringBoostPercent,
    };

    createProperty.mutate(propertyData, {
      onSuccess: () => {
        toast({
          title: "Property Added",
          description: `${formData.name} has been added to the portfolio.`,
        });
        setIsAddDialogOpen(false);
        resetForm();
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to add property. Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) {
    return <PageLoadingState />;
  }

  if (isError) {
    return <PageErrorState message="Failed to load portfolio data" />;
  }

  const unassignedProperties = properties?.filter(
    (p) => (p as typeof p & { portfolioId?: number | null }).portfolioId == null
  ) ?? [];

  return (
    <Layout>
      <AnimatedPage>
      <PageTransition><div className="space-y-6">
        <PageHeader
          title="Property Portfolio"
          subtitle="Managed assets & developments"
          variant="dark"
          actions={
            <AddPropertyDialog
              open={isAddDialogOpen}
              onOpenChange={setIsAddDialogOpen}
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              isPending={createProperty.isPending}
              onCancel={() => { setIsAddDialogOpen(false); resetForm(); }}
              onAcquisitionDateChange={handleAcquisitionDateChange}
              trigger={
                <Button variant="outline" data-testid="button-add-property">
                  <IconPlus className="w-4 h-4" />
                  Add Property
                </Button>
              }
            />
          }
        />

        <AnimatedGrid className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {properties?.slice().sort((a, b) => new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime()).map((property, index) => (
            <PortfolioPropertyCard
              key={property.id}
              property={property}
              propertyNumber={index + 1}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
              propertyUrls={allPropertyUrls.filter(u => u.propertyId === property.id)}
            />
          ))}
        </AnimatedGrid>

        {/* Unassigned properties section */}
        {unassignedProperties.length > 0 && (
          <div className="space-y-4 border-t border-border pt-6">
            <div className="flex items-center justify-between min-w-0 gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">Unassigned Properties</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {unassignedProperties.length}{" "}
                  {unassignedProperties.length === 1 ? "property" : "properties"} not in any
                  portfolio
                </p>
              </div>
              <div className="shrink-0">
                <Select
                  value={selectedPortfolioId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedPortfolioId(Number(v))}
                >
                  <SelectTrigger className="w-[200px]" data-testid="select-target-portfolio">
                    <SelectValue placeholder="Select portfolio…" />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolios.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {unassignedProperties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3 min-w-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{property.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{property.location}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (selectedPortfolioId != null) {
                        assignMutation.mutate({
                          propertyId: property.id,
                          portfolioId: selectedPortfolioId,
                        });
                      }
                    }}
                    disabled={selectedPortfolioId == null || assignMutation.isPending}
                    data-testid={`button-assign-property-${property.id}`}
                  >
                    {assignMutation.isPending && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    )}
                    Assign to portfolio
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div></PageTransition>
      </AnimatedPage>
    </Layout>
  );
}
