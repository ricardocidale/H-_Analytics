/**
 * PortfolioPropertyCard.tsx — Summary card for one property on the portfolio dashboard.
 *
 * Displays a compact overview of a hotel property:
 *   • Single hero image (chosen by user/admin via set-hero)
 *   • Property name and location
 *   • Room count and key financial snapshot (ADR, purchase price)
 *   • Active/Inactive toggle — excludes property from all portfolio calculations when OFF
 *   • Navigation links: Photos, Assumptions, Details
 *   • Delete button (with confirmation) to remove from the portfolio
 *   • Right-click context menu for quick actions
 */
import { memo } from "react";
import { PropertyStatus } from "@shared/constants";
import { formatMoney } from "@/lib/financialEngine";
import { ArrowRight } from "@/components/icons/themed-icons";
import { IconTrash, IconMapPin, IconBed, IconCalendar, IconSettings, IconCamera, IconMap, IconGlobe } from "@/components/icons";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { StaggerItem, TiltCard } from "@/components/ui/animated";
import { AnimatedGridItem } from "@/components/graphics";
import type { Property, PropertyUrl } from "@shared/schema";
import { HeroImage } from "@/features/property-images";
import { cn } from "@/lib/utils";
import { PropertyTypeBadge } from "@/components/research/PropertyTypeSelector";
import { ValidationStatusBadge } from "@/components/analyst";
import { usePropertyPhotos } from "@/lib/api";
import { buildLocationLinks, hasCoordinates } from "@/lib/map-utils";

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

interface PortfolioPropertyCardProps {
  property: Property;
  propertyNumber: number;
  onDelete: (id: number, name: string) => void;
  onToggleActive?: (id: number, isActive: boolean) => void;
  propertyUrls?: PropertyUrl[];
}

export const PortfolioPropertyCard = memo(function PortfolioPropertyCard({ property, propertyNumber, onDelete, onToggleActive, propertyUrls = [] }: PortfolioPropertyCardProps) {
  const isActive = property.isActive !== false;
  const { data: photos = [] } = usePropertyPhotos(property.id);
  const heroPhoto = photos.find(p => p.isHero);
  const heroSrc = heroPhoto
    ? (heroPhoto.enhancedImageData
      ? `/api/property-photos/${heroPhoto.id}/enhanced-image`
      : heroPhoto.imageUrl)
    : property.imageUrl;
  const isEnhanced = !!heroPhoto?.enhancedImageData;
  const visibleLinks = propertyUrls.filter(l => l.isValid === true && l.isRelevant === true);
  const validLinks = visibleLinks.slice(0, 3);
  const [, navigate] = useLocation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <AnimatedGridItem className="h-full">
        <StaggerItem className="h-full">
        <TiltCard intensity={5} className="h-full">
        <div className={cn(
          "group relative overflow-hidden rounded-lg flex flex-col h-full bg-card border border-border shadow-sm transition-all duration-300 hover:shadow-lg",
          !isActive && "opacity-60 saturate-50"
        )}>
          <div className="relative">
              <HeroImage
                src={heroSrc}
                alt={property.name}
                aspectRatio="16/10"
                overlay="none"
                className="rounded-t-lg rounded-b-none"
                variants={null}
              >
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
                {isEnhanced && (
                  <div className="absolute bottom-5 right-3 z-10">
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/70 text-white text-[9px] font-medium backdrop-blur-sm border border-white/15" data-testid={`badge-enhanced-hero-${property.id}`}>
                      Enhanced
                    </span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3">
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-foreground/40 text-white/80 text-xs font-mono font-semibold border border-white/15">
                    {propertyNumber}
                  </span>
                </div>
                <div className="absolute top-3 left-3">
                  <span
                    data-testid={`badge-type-${property.id}`}
                    className={`px-3 py-1 rounded-full text-xs font-medium label-text ${
                      property.type === "Financed"
                        ? "bg-secondary text-secondary-foreground border border-white/20"
                        : "bg-primary text-primary-foreground border border-white/20"
                    }`}
                  >
                    {property.type}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border border-white/20 label-text ${
                    property.status === PropertyStatus.OPERATING ? "bg-primary text-white" :
                    property.status === PropertyStatus.IMPROVEMENTS ? "bg-accent-pop text-white" :
                    property.status === PropertyStatus.ACQUIRED ? "bg-chart-1 text-white" :
                    property.status === PropertyStatus.PLANNED ? "bg-chart-1 text-white" :
                    property.status === PropertyStatus.IN_NEGOTIATION ? "bg-chart-3 text-white" :
                    property.status === PropertyStatus.PIPELINE ? "bg-muted0 text-white" : "bg-card/20 text-white"
                  }`}>
                    {property.status}
                  </span>
                </div>
                {!isActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20 label-text">
                      Excluded from portfolio
                    </span>
                  </div>
                )}
              </HeroImage>

            <div className="p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-xl text-foreground">{property.name}</h3>
                {(property.starRating || property.hospitalityType) && (
                  <PropertyTypeBadge type={property.hospitalityType || "hotel"} starRating={property.starRating} />
                )}
                <ValidationStatusBadge property={property} />
              </div>
              <div className="flex items-center text-foreground/60 text-sm mt-1 label-text">
                <IconMapPin className="w-3 h-3 mr-1" />
                {property.location}
                {hasCoordinates(property) && (() => {
                  const links = buildLocationLinks(property.latitude!, property.longitude!, property.name);
                  return (
                    <span className="inline-flex items-center gap-1 ml-2">
                      <a
                        href={links.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-primary/10 text-foreground/40 hover:text-primary transition-colors"
                        title="Open in Google Maps"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-map-${property.id}`}
                      >
                        <IconMap className="w-3 h-3" />
                      </a>
                      <a
                        href={links.googleEarth3dUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-primary/10 text-foreground/40 hover:text-primary transition-colors"
                        title="3D View in Google Earth"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-3d-${property.id}`}
                      >
                        <IconGlobe className="w-3 h-3" />
                      </a>
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center text-foreground/50 text-xs mt-1.5 label-text">
                <IconCalendar className="w-3 h-3 mr-1" />
                {property.status === PropertyStatus.ACQUIRED || property.status === PropertyStatus.OPERATING ? "Acquired" : "Planned"}{" "}
                {new Date(property.acquisitionDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </div>
              {property.description && (
                <p className="text-xs text-foreground/55 mt-2.5 leading-relaxed line-clamp-3" data-testid={`text-description-${property.id}`}>
                  {truncateWords(property.description, 60)}
                </p>
              )}
              {validLinks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5" data-testid={`links-chips-${property.id}`}>
                  {validLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                        link.isRelevant
                          ? "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
                          : "border-border bg-muted/50 text-foreground/60 hover:bg-muted"
                      }`}
                      data-testid={`card-link-chip-${link.id}`}
                      title={link.url}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="w-1 h-1 rounded-full shrink-0" style={{
                        backgroundColor: link.isRelevant ? "var(--primary)" : "var(--muted-foreground)",
                      }} />
                      {link.label || (() => { try { return new URL(link.url).hostname.replace("www.", ""); } catch { return "Link"; } })()}
                    </a>
                  ))}
                  {visibleLinks.length > 3 && (
                    <span className="text-[10px] text-muted-foreground self-center">
                      +{visibleLinks.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 pb-4 flex-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <p className="text-xs text-foreground/50 mb-1 label-text">Acquisition</p>
                  <p className="font-mono font-semibold text-foreground">{formatMoney(property.purchasePrice)}</p>
                </div>
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <p className="text-xs text-foreground/50 mb-1 label-text">Capacity</p>
                  <p className="font-semibold text-foreground flex items-center">
                    <IconBed className="w-3 h-3 mr-1" />
                    <span className="font-mono">{property.roomCount}</span> <span className="label-text ml-1">Rooms</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Active toggle row */}
            <div className="px-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => onToggleActive?.(property.id, checked)}
                  data-testid={`switch-active-${property.id}`}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-xs text-muted-foreground label-text">
                  {isActive ? "Included in portfolio" : "Excluded from portfolio"}
                </span>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 border-t border-border flex items-center justify-between gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    data-testid={`button-delete-property-${property.id}`}
                    aria-label={`Delete ${property.name}`}
                  >
                    <IconTrash className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Property?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove {property.name} from the portfolio.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => onDelete(property.id, property.name)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex items-center gap-2">
                <Link href={`/property/${property.id}/photos`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    data-testid={`button-photos-${property.id}`}
                    title="Photo Album"
                  >
                    <IconCamera className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href={`/property/${property.id}/edit`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-transform"
                    data-testid={`button-assumptions-${property.id}`}
                  >
                    <IconSettings className="w-3.5 h-3.5" />
                    Assumptions
                  </Button>
                </Link>
                <Link href={`/property/${property.id}`}>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-transform"
                    data-testid={`button-details-${property.id}`}
                  >
                    Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
        </TiltCard>
        </StaggerItem>
        </AnimatedGridItem>
      </ContextMenuTrigger>

      {/* Right-click context menu */}
      <ContextMenuContent className="w-52" data-testid={`context-menu-${property.id}`}>
        <ContextMenuItem
          onClick={() => navigate(`/property/${property.id}`)}
          data-testid={`context-view-${property.id}`}
        >
          View Details
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => navigate(`/property/${property.id}/edit`)}
          data-testid={`context-edit-${property.id}`}
        >
          Edit Assumptions
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => navigate(`/property/${property.id}/photos`)}
          data-testid={`context-photos-${property.id}`}
        >
          Photo Album
          {photos.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">{photos.length}</span>
          )}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onToggleActive?.(property.id, !isActive)}
          data-testid={`context-toggle-${property.id}`}
        >
          {isActive ? "Exclude from Portfolio" : "Include in Portfolio"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onDelete(property.id, property.name)}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
          data-testid={`context-delete-${property.id}`}
        >
          Delete Property
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
