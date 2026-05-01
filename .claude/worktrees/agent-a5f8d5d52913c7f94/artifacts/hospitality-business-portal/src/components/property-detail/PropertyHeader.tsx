/**
 * PropertyHeader.tsx — Hero banner and navigation for the property detail page.
 *
 * Renders the property's hero image (with gradient overlay for readability),
 * property name, location pin, and quick-action buttons:
 *   • Back arrow  – navigates to the portfolio list
 *   • Settings    – links to the property's Edit Assumptions page
 *   • Map         – external link to the property's address on a map
 *
 * Also displays the acquisition date, room count, and purchase price as
 * compact badges so users get immediate context at a glance.
 */
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft } from "@/components/icons/themed-icons";
import { IconMapPin, IconSettings, IconMap, IconCamera } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { PropertyPhotoUpload } from "@/components/PropertyPhotoUpload";
import { HeroImage } from "@/features/property-images";
import type { PropertyHeaderProps } from "./types";
import { ValidationStatusBadge } from "@/components/analyst";
import { usePropertyPhotos } from "@/lib/api";

export default function PropertyHeader({ property, propertyId, heroCaption, onPhotoUploadComplete }: PropertyHeaderProps) {
  const { data: photos = [] } = usePropertyPhotos(propertyId);
  const heroPhoto = photos.find(p => p.isHero);
  const heroSrc = heroPhoto?.enhancedImageData
    ? `/api/property-photos/${heroPhoto.id}/enhanced-image`
    : property.imageUrl;
  const isEnhanced = !!heroPhoto?.enhancedImageData;
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 1], [0.15, 0.45]);

  const getStatusLabel = (status: string) => {
    return status;
  };

  return (
    <div ref={heroRef} className="relative overflow-hidden rounded-lg">
      <motion.div style={{ y: heroY, scale: heroScale }} className="will-change-transform">
        <HeroImage
          src={heroSrc}
          alt={property.name}
          caption={heroCaption}
          aspectRatio="auto"
          overlay="full"
          className="h-[180px] sm:h-[280px] rounded-none"
          priority
        >
          {isEnhanced && (
            <div className="absolute top-3 left-3 z-10">
              <span className="px-2 py-0.5 rounded-full bg-primary/80 text-white text-[10px] font-medium backdrop-blur-sm border border-white/20" data-testid="badge-hero-enhanced">
                AI Enhanced
              </span>
            </div>
          )}
          <PropertyPhotoUpload
            propertyId={propertyId}
            currentImageUrl={property.imageUrl}
            onUploadComplete={onPhotoUploadComplete}
          />
        </HeroImage>
      </motion.div>
      <motion.div
        className="absolute inset-0 bg-black pointer-events-none rounded-t-lg"
        style={{ opacity: overlayOpacity }}
      />
      
      <div className="relative overflow-hidden p-3 sm:p-6 bg-card border-b">
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/portfolio">
              <Button variant="outline" size="icon" className="h-9 w-9 hover:scale-[1.03] active:scale-[0.97] transition-transform" aria-label="Back to portfolio">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-display text-foreground">{property.name}</h1>
                <ValidationStatusBadge property={property} />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-foreground/70 text-sm mt-1 label-text">
                <span className="flex items-center gap-1"><IconMapPin className="w-4 h-4 text-primary" /> {property.location}</span>
                <span className="font-mono">{property.roomCount} Rooms</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-medium">
                  {getStatusLabel(property.status)}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const addressParts = [property.streetAddress, property.streetAddress2, property.city, property.stateProvince, property.zipPostalCode, property.country].filter(Boolean);
              const hasAddress = addressParts.length > 0;
              const mapQuery = hasAddress ? addressParts.join(", ") : "";
              const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
              return (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => hasAddress && window.open(mapUrl, "_blank")}
                  disabled={!hasAddress}
                  title={hasAddress ? `View ${mapQuery} on Google Maps` : "No address provided — add address details in Assumptions"}
                  className="gap-2 h-9 text-xs font-medium hover:scale-[1.03] active:scale-[0.97] transition-transform"
                >
                  <IconMap className="w-4 h-4" />
                  Map
                </Button>
              );
            })()}
            <Link href={`/property/${propertyId}/photos`}>
              <Button variant="outline" size="sm" className="gap-2 h-9 text-xs font-medium hover:scale-[1.03] active:scale-[0.97] transition-transform" data-testid="button-photos">
                <IconCamera className="w-4 h-4" />
                Photos
              </Button>
            </Link>
            <Link href={`/property/${propertyId}/edit`}>
              <Button variant="outline" size="sm" className="gap-2 h-9 text-xs font-medium hover:scale-[1.03] active:scale-[0.97] transition-transform">
                <IconSettings className="w-4 h-4" />
                Assumptions
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
