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
import { PropertyStatus } from "@shared/constants";
import Layout from "@/components/Layout";
import { useProperties, useDeleteProperty, useCreateProperty, useGlobalAssumptions, useUpdateProperty, useAllPropertyUrls } from "@/lib/api";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPlus, IconAlertTriangle } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { InsertProperty } from "@shared/schema";
import {
  DEFAULT_ADR_GROWTH_RATE,
  DEFAULT_START_OCCUPANCY,
  DEFAULT_MAX_OCCUPANCY,
  DEFAULT_OCCUPANCY_GROWTH_STEP,
  DEFAULT_OCCUPANCY_RAMP_MONTHS,
  DEFAULT_CATERING_BOOST_PCT,
  DEFAULT_ROOM_COUNT,
  DEFAULT_START_ADR,
} from "@/lib/constants";
import { PageTransition } from "@/components/ui/animated";
import { AnimatedPage, AnimatedGrid } from "@/components/graphics";
import { AddPropertyDialog, PortfolioPropertyCard } from "@/components/portfolio";
import type { AddPropertyFormData } from "@/components/portfolio";

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
  roomCount: DEFAULT_ROOM_COUNT,
  startAdr: DEFAULT_START_ADR,
  adrGrowthRate: DEFAULT_ADR_GROWTH_RATE,
  startOccupancy: DEFAULT_START_OCCUPANCY,
  maxOccupancy: DEFAULT_MAX_OCCUPANCY,
  occupancyRampMonths: DEFAULT_OCCUPANCY_RAMP_MONTHS,
  occupancyGrowthStep: DEFAULT_OCCUPANCY_GROWTH_STEP,
  type: "Full Equity",
  cateringBoostPercent: DEFAULT_CATERING_BOOST_PCT,
  country: "",
  stateProvince: "",
};

type PortfolioTab = "properties" | "map";

export default function Portfolio() {
  const { data: properties, isLoading, isError } = useProperties();
  const { data: global } = useGlobalAssumptions();
  const { data: allPropertyUrls = [] } = useAllPropertyUrls();
  const deleteProperty = useDeleteProperty();
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PortfolioTab>("properties");
  const [formData, setFormData] = useState<AddPropertyFormData>({ ...INITIAL_FORM_DATA });

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
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load portfolio data. Please try refreshing the page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <AnimatedPage>
      <PageTransition><div className="space-y-8">
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
      </div></PageTransition>
      </AnimatedPage>
    </Layout>
  );
}
