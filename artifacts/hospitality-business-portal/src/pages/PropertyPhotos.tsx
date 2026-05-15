import Layout from "@/components/Layout";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { PageErrorState } from "@/components/ui/page-error-state";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { useProperty, useAddPropertyPhoto, useSetHeroPhoto, usePropertyPhotos } from "@/lib/api";
import { PropertyImagePicker, PhotoAlbumGrid } from "@/features/property-images";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function PropertyPhotos() {
  const [, params] = useRoute("/property/:id/photos");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const queryClient = useQueryClient();

  const { data: property, isLoading, isError } = useProperty(propertyId);
  const { data: photos = [] } = usePropertyPhotos(propertyId);
  const addPhoto = useAddPropertyPhoto();
  const setHero = useSetHeroPhoto();

  // Hero changes route through the photo album:
  //   1. If the chosen URL already lives in the album, just promote that row.
  //   2. Otherwise, add a new photo row for the URL and promote it.
  // `setHeroPhoto` (server-side) demotes any existing hero AND mirrors the new
  // hero's `imageUrl` onto `properties.image_url`, so the cache and the album
  // stay equal — no PUT-imageUrl shortcut, no drift.
  const handleImageChange = async (url: string) => {
    const existing = photos.find(p => p.imageUrl === url);
    let photoId = existing?.id;
    if (!photoId) {
      const created = await addPhoto.mutateAsync({
        propertyId,
        imageUrl: url,
        skipProcessing: true,
      });
      photoId = created.id;
    }
    await setHero.mutateAsync({ propertyId, photoId });
    queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
    queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
  };

  if (isLoading) {
    return <PageLoadingState />;
  }

  if (isError || !property) {
    return <PageErrorState message="Property not found" />;
  }

  return (
    <Layout>
      <AnimatedPage>
        <div className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
          <PageHeader
            title={<span data-testid="text-page-title">Photos — {property.name}</span>}
            subtitle={property.location}
            backLink={`/property/${propertyId}`}
            backLinkTestId="button-back"
          />

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
