import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { useProperty } from "@/lib/api";
import { PropertyImagePicker, PhotoAlbumGrid } from "@/features/property-images";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export default function PropertyPhotos() {
  const [, params] = useRoute("/property/:id/photos");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const queryClient = useQueryClient();

  const { data: property, isLoading, isError } = useProperty(propertyId);

  const handleImageChange = async (url: string) => {
    const res = await fetch(`/api/properties/${propertyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loading-spinner" />
        </div>
      </Layout>
    );
  }

  if (isError || !property) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <IconAlertTriangle className="w-12 h-12 text-destructive" />
          <p className="text-lg text-foreground" data-testid="text-error">Property not found</p>
          <Link href="/portfolio">
            <Button variant="outline" data-testid="link-portfolio">Back to Portfolio</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <AnimatedPage>
        <div className="max-w-5xl mx-auto space-y-6 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Link href={`/property/${propertyId}`}>
              <Button variant="outline" size="icon" className="h-9 w-9 hover:scale-[1.03] active:scale-[0.97] transition-transform" data-testid="button-back" aria-label="Back to property">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-display text-foreground" data-testid="text-page-title">
                Photos — {property.name}
              </h1>
              <p className="text-sm text-muted-foreground label-text">{property.location}</p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="relative p-6 space-y-6">
              <div>
                <h3 className="text-lg font-display text-foreground mb-1">Hero Photo</h3>
                <p className="text-muted-foreground text-sm label-text mb-4">
                  The main photo shown on portfolio cards and the property detail header.
                </p>
                <PropertyImagePicker
                  imageUrl={property.imageUrl}
                  onImageChange={handleImageChange}
                  propertyName={property.name}
                  location={property.location}
                  variant="light"
                />
              </div>
            </div>
          </div>

          <PhotoAlbumGrid
            propertyId={propertyId}
            propertyName={property.name}
            location={property.location}
            roomCount={property.roomCount}
            propertyType={property.type}
          />
        </div>
      </AnimatedPage>
    </Layout>
  );
}
