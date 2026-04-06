import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDesignThemes, useUpdateTheme } from "@/features/design-themes/useDesignThemes";
import type { IconSetType } from "@/features/design-themes/types";

import {
  Star as LucideStar, Bell as LucideBell, Search as LucideSearch, Home as LucideHome,
  AlertTriangle as LucideAlert, Check as LucideCheck, Plus as LucidePlus, X as LucideX,
  Settings as LucideSettings, Mail as LucideMail, Lock as LucideLock, Shield as LucideShield,
  Trash2 as LucideTrash, Pencil as LucidePencil, Upload as LucideUpload, Info as LucideInfo,
  ChevronDown as LucideChevronDown, ChevronRight as LucideChevronRight, Phone as LucidePhone,
  Clock as LucideClock, FileText as LucideFileText, Image as LucideImage,
  Send as LucideSend, RefreshCw as LucideRefreshCw, ExternalLink as LucideExternalLink,
  Calculator as LucideCalculator, Building2 as LucideBuilding, Sparkles as LucideSparkles,
  Share2 as LucideShare, ZoomIn as LucideZoomIn, Trophy as LucideTrophy,
  Loader2 as LucideLoader, Scale as LucideScale, Server as LucideServer,
} from "lucide-react";
import {
  Star as PhStar, Bell as PhBell, MagnifyingGlass as PhSearch, House as PhHome,
  Warning as PhAlert, Check as PhCheck, Plus as PhPlus, X as PhX,
  GearSix as PhSettings, Envelope as PhMail, Lock as PhLock, Shield as PhShield,
  Trash as PhTrash, PencilSimple as PhPencil, Upload as PhUpload, Info as PhInfo,
  CaretDown as PhChevronDown, CaretRight as PhChevronRight, Phone as PhPhone,
  Clock as PhClock, FileText as PhFileText, Image as PhImage,
  PaperPlaneTilt as PhSend, ArrowsClockwise as PhRefreshCw, ArrowSquareOut as PhExternalLink,
  Calculator as PhCalculator, Buildings as PhBuilding, Sparkle as PhSparkles,
  ShareNetwork as PhShare, MagnifyingGlassPlus as PhZoomIn, Trophy as PhTrophy,
  CircleNotch as PhLoader, Scales as PhScale, HardDrives as PhServer,
} from "@phosphor-icons/react";
import {
  MdOutlineStarOutline as MdStar, MdOutlineNotifications as MdBell,
  MdOutlineSearch as MdSearch, MdOutlineHome as MdHome,
  MdOutlineWarningAmber as MdAlert, MdOutlineCheck as MdCheck,
  MdOutlineAdd as MdPlus, MdOutlineClose as MdX,
  MdOutlineSettings as MdSettings, MdOutlineMail as MdMail,
  MdOutlineLock as MdLock, MdOutlineShield as MdShield,
  MdOutlineDeleteOutline as MdTrash, MdOutlineEdit as MdPencil,
  MdOutlineUploadFile as MdUpload, MdOutlineInfo as MdInfo,
  MdOutlineExpandMore as MdChevronDown, MdOutlineChevronRight as MdChevronRight,
  MdOutlinePhone as MdPhone, MdOutlineSchedule as MdClock,
  MdOutlineDescription as MdFileText, MdOutlineImage as MdImage,
  MdOutlineSend as MdSend, MdOutlineRefresh as MdRefreshCw,
  MdOutlineOpenInNew as MdExternalLink, MdOutlineCalculate as MdCalculator,
  MdOutlineApartment as MdBuilding, MdOutlineAutoAwesome as MdSparkles,
  MdOutlineShare as MdShare, MdOutlineZoomIn as MdZoomIn,
  MdOutlineEmojiEvents as MdTrophy, MdOutlineAutorenew as MdLoader,
  MdOutlineBalance as MdScale, MdOutlineDns as MdServer,
} from "react-icons/md";

interface IconEntry {
  name: string;
  lucide: React.ComponentType<any>;
  phosphor: React.ComponentType<any>;
  material: React.ComponentType<any>;
  category: string;
}

const ICON_CATALOG: IconEntry[] = [
  { name: "Star",         lucide: LucideStar,     phosphor: PhStar,      material: MdStar,         category: "Action" },
  { name: "Bell",         lucide: LucideBell,     phosphor: PhBell,      material: MdBell,         category: "Alert" },
  { name: "Search",       lucide: LucideSearch,   phosphor: PhSearch,    material: MdSearch,       category: "Action" },
  { name: "Home",         lucide: LucideHome,     phosphor: PhHome,      material: MdHome,         category: "Navigation" },
  { name: "Alert",        lucide: LucideAlert,    phosphor: PhAlert,     material: MdAlert,        category: "Alert" },
  { name: "Check",        lucide: LucideCheck,    phosphor: PhCheck,     material: MdCheck,        category: "Action" },
  { name: "Plus",         lucide: LucidePlus,     phosphor: PhPlus,      material: MdPlus,         category: "Action" },
  { name: "Close",        lucide: LucideX,        phosphor: PhX,         material: MdX,            category: "Navigation" },
  { name: "Settings",     lucide: LucideSettings, phosphor: PhSettings,  material: MdSettings,     category: "Action" },
  { name: "Mail",         lucide: LucideMail,     phosphor: PhMail,      material: MdMail,         category: "Communication" },
  { name: "Lock",         lucide: LucideLock,     phosphor: PhLock,      material: MdLock,         category: "Action" },
  { name: "Shield",       lucide: LucideShield,   phosphor: PhShield,    material: MdShield,       category: "Action" },
  { name: "Trash",        lucide: LucideTrash,    phosphor: PhTrash,     material: MdTrash,        category: "Action" },
  { name: "Pencil",       lucide: LucidePencil,   phosphor: PhPencil,    material: MdPencil,       category: "Editor" },
  { name: "Upload",       lucide: LucideUpload,   phosphor: PhUpload,    material: MdUpload,       category: "File" },
  { name: "Info",         lucide: LucideInfo,     phosphor: PhInfo,      material: MdInfo,         category: "Alert" },
  { name: "Chevron Down", lucide: LucideChevronDown, phosphor: PhChevronDown, material: MdChevronDown, category: "Navigation" },
  { name: "Chevron Right",lucide: LucideChevronRight,phosphor: PhChevronRight,material: MdChevronRight,category: "Navigation" },
  { name: "Phone",        lucide: LucidePhone,    phosphor: PhPhone,     material: MdPhone,        category: "Communication" },
  { name: "Clock",        lucide: LucideClock,    phosphor: PhClock,     material: MdClock,        category: "Action" },
  { name: "File",         lucide: LucideFileText, phosphor: PhFileText,  material: MdFileText,     category: "File" },
  { name: "Image",        lucide: LucideImage,    phosphor: PhImage,     material: MdImage,        category: "File" },
  { name: "Send",         lucide: LucideSend,     phosphor: PhSend,      material: MdSend,         category: "Communication" },
  { name: "Refresh",      lucide: LucideRefreshCw,phosphor: PhRefreshCw, material: MdRefreshCw,    category: "Action" },
  { name: "External Link",lucide: LucideExternalLink,phosphor: PhExternalLink,material: MdExternalLink,category: "Navigation" },
  { name: "Calculator",   lucide: LucideCalculator,phosphor: PhCalculator,material: MdCalculator,  category: "Finance" },
  { name: "Building",     lucide: LucideBuilding, phosphor: PhBuilding,  material: MdBuilding,     category: "Finance" },
  { name: "Sparkles",     lucide: LucideSparkles, phosphor: PhSparkles,  material: MdSparkles,     category: "Action" },
  { name: "Share",        lucide: LucideShare,    phosphor: PhShare,     material: MdShare,        category: "Communication" },
  { name: "Zoom In",      lucide: LucideZoomIn,   phosphor: PhZoomIn,    material: MdZoomIn,       category: "Action" },
  { name: "Trophy",       lucide: LucideTrophy,   phosphor: PhTrophy,    material: MdTrophy,       category: "Action" },
  { name: "Loader",       lucide: LucideLoader,   phosphor: PhLoader,    material: MdLoader,       category: "Action" },
  { name: "Scale",        lucide: LucideScale,    phosphor: PhScale,     material: MdScale,        category: "Finance" },
  { name: "Server",       lucide: LucideServer,   phosphor: PhServer,    material: MdServer,       category: "Action" },
];

const CATEGORIES = Array.from(new Set(ICON_CATALOG.map(i => i.category))).sort();

const ICON_SET_INFO: Record<IconSetType, { label: string; description: string; source: string; style: string; count: string }> = {
  lucide: {
    label: "Lucide",
    description: "Clean, consistent stroke icons based on Feather Icons. Lightweight with a modern aesthetic.",
    source: "lucide.dev",
    style: "Outline (stroke-based)",
    count: "1,500+",
  },
  phosphor: {
    label: "Phosphor",
    description: "Flexible icon family with six weights. Rounded feel with generous padding.",
    source: "phosphoricons.com",
    style: "Regular weight (outline)",
    count: "1,200+",
  },
  material: {
    label: "Material Design",
    description: "Google's icon system following Material Design guidelines. Crisp, geometric outlines.",
    source: "fonts.google.com/icons",
    style: "Outlined (Material Symbols)",
    count: "2,500+",
  },
};

function IconComparisonCard({ entry, highlightSet }: { entry: IconEntry; highlightSet: IconSetType }) {
  const sets: { key: IconSetType; Icon: React.ComponentType<any> }[] = [
    { key: "lucide", Icon: entry.lucide },
    { key: "phosphor", Icon: entry.phosphor },
    { key: "material", Icon: entry.material },
  ];

  return (
    <div
      className="group relative rounded-xl border border-border/60 bg-card hover:border-primary/30 hover:shadow-sm transition-all p-3"
      data-testid={`icon-card-${entry.name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="grid grid-cols-3 gap-2 mb-2">
        {sets.map(({ key, Icon }) => (
          <div
            key={key}
            className={cn(
              "flex items-center justify-center rounded-lg p-2.5 transition-colors",
              key === highlightSet
                ? "bg-primary/10 ring-1 ring-primary/30"
                : "bg-muted/40"
            )}
          >
            <Icon className="w-5 h-5" size={20} />
          </div>
        ))}
      </div>
      <div className="text-center">
        <p className="text-[11px] font-medium text-foreground truncate">{entry.name}</p>
        <p className="text-[9px] text-muted-foreground">{entry.category}</p>
      </div>
    </div>
  );
}

function IconSetInfoCard({ setKey, isActive, onActivate }: { setKey: IconSetType; isActive: boolean; onActivate: () => void }) {
  const info = ICON_SET_INFO[setKey];
  return (
    <button
      type="button"
      onClick={onActivate}
      className={cn(
        "relative text-left rounded-xl border-2 p-4 transition-all cursor-pointer w-full",
        isActive
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border/60 bg-card hover:border-primary/20 hover:shadow-sm"
      )}
      data-testid={`icon-set-card-${setKey}`}
    >
      {isActive && (
        <div className="absolute top-3 right-3">
          <Badge variant="default" className="text-[10px] px-1.5 py-0.5">Active</Badge>
        </div>
      )}
      <h4 className="text-sm font-semibold text-foreground mb-1">{info.label}</h4>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed pr-12">{info.description}</p>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">{info.style}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">{info.count} icons</span>
        <a
          href={`https://${info.source}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {info.source}
        </a>
      </div>
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/40">
        {ICON_CATALOG.slice(0, 8).map((entry) => {
          const Icon = setKey === "lucide" ? entry.lucide : setKey === "phosphor" ? entry.phosphor : entry.material;
          return (
            <div key={entry.name} className="w-6 h-6 rounded-md bg-muted/60 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-foreground/70" size={14} />
            </div>
          );
        })}
      </div>
    </button>
  );
}

export default function IconCustomizationTab() {
  const { data: themes } = useDesignThemes();
  const updateMutation = useUpdateTheme();
  const activeTheme = themes?.find(t => t.isDefault);
  const currentIconSet: IconSetType = activeTheme?.iconSet ?? "lucide";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredIcons = useMemo(() => {
    let icons = ICON_CATALOG;
    if (selectedCategory !== "All") {
      icons = icons.filter(i => i.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      icons = icons.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }
    return icons;
  }, [searchQuery, selectedCategory]);

  const handleSetChange = (newSet: IconSetType) => {
    if (activeTheme && !activeTheme.isSystem) {
      updateMutation.mutate({ id: activeTheme.id, data: { iconSet: newSet } });
    }
  };

  return (
    <div className="space-y-6" data-testid="icon-customization-tab">
      <Card className="relative overflow-hidden bg-card/80 backdrop-blur-xl border border-border shadow-lg">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/8 blur-[80px] animate-pulse" style={{ animationDuration: "5s" }} />
        </div>
        <CardHeader className="relative pb-3">
          <CardTitle className="text-lg font-display">Icon Library</CardTitle>
          <CardDescription>
            Choose an icon set for your theme. The active set applies across the entire platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(Object.keys(ICON_SET_INFO) as IconSetType[]).map((setKey) => (
              <IconSetInfoCard
                key={setKey}
                setKey={setKey}
                isActive={currentIconSet === setKey}
                onActivate={() => handleSetChange(setKey)}
              />
            ))}
          </div>
          {activeTheme?.isSystem && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <LucideLock className="w-3.5 h-3.5" />
              System themes cannot be modified. Create a custom theme to change icons.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden bg-card/80 backdrop-blur-xl border border-border shadow-lg">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-secondary/8 blur-[100px] animate-pulse" style={{ animationDuration: "6s" }} />
        </div>
        <CardHeader className="relative pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg font-display">Icon Comparison</CardTitle>
              <CardDescription>
                Browse all themed icons side-by-side. The highlighted column is your active set.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search icons..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 h-8 text-xs"
                data-testid="input-icon-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            <Button
              variant={selectedCategory === "All" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("All")}
              className="text-xs h-7 px-2.5"
              data-testid="button-category-all"
            >
              All ({ICON_CATALOG.length})
            </Button>
            {CATEGORIES.map((cat) => {
              const count = ICON_CATALOG.filter(i => i.category === cat).length;
              return (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                  className="text-xs h-7 px-2.5"
                  data-testid={`button-category-${cat.toLowerCase()}`}
                >
                  {cat} ({count})
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-6 mb-4 pb-3 border-b border-border/40">
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              <span>Column order:</span>
              <div className="flex items-center gap-3">
                <span className={cn("px-2 py-0.5 rounded", currentIconSet === "lucide" && "bg-primary/10 text-primary")}>Lucide</span>
                <span className={cn("px-2 py-0.5 rounded", currentIconSet === "phosphor" && "bg-primary/10 text-primary")}>Phosphor</span>
                <span className={cn("px-2 py-0.5 rounded", currentIconSet === "material" && "bg-primary/10 text-primary")}>Material</span>
              </div>
            </div>
          </div>

          {filteredIcons.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {filteredIcons.map((entry) => (
                <IconComparisonCard key={entry.name} entry={entry} highlightSet={currentIconSet} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <LucideSearch className="w-8 h-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm">No icons match your search.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden bg-card/80 backdrop-blur-xl border border-border shadow-lg">
        <CardHeader className="relative pb-3">
          <CardTitle className="text-lg font-display">Material Design Icon Categories</CardTitle>
          <CardDescription>
            Google Material Design Icons are organized into categories. Browse the full collection at{" "}
            <a href="https://fonts.google.com/icons" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              fonts.google.com/icons
            </a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[
              { name: "Action", icon: MdCheck, desc: "Common actions and operations", count: "200+" },
              { name: "Alert", icon: MdAlert, desc: "Alerts, warnings, and notifications", count: "50+" },
              { name: "AV", icon: MdStar, desc: "Audio/video playback controls", count: "80+" },
              { name: "Communication", icon: MdMail, desc: "Email, chat, and messaging", count: "100+" },
              { name: "Content", icon: MdPencil, desc: "Text editing and formatting", count: "120+" },
              { name: "Device", icon: MdPhone, desc: "Device and hardware controls", count: "90+" },
              { name: "Editor", icon: MdPencil, desc: "Text and content editing", count: "70+" },
              { name: "File", icon: MdFileText, desc: "File management and uploads", count: "60+" },
              { name: "Hardware", icon: MdServer, desc: "Hardware and peripherals", count: "50+" },
              { name: "Home", icon: MdHome, desc: "Home and navigation", count: "40+" },
              { name: "Maps", icon: MdSearch, desc: "Location, maps, and places", count: "80+" },
              { name: "Navigation", icon: MdChevronRight, desc: "Navigation arrows and menus", count: "100+" },
              { name: "Social", icon: MdShare, desc: "Social sharing and networks", count: "60+" },
              { name: "Toggle", icon: MdCheck, desc: "Toggle controls and switches", count: "30+" },
              { name: "Finance", icon: MdCalculator, desc: "Financial and business icons", count: "40+" },
              { name: "Places", icon: MdBuilding, desc: "Buildings, hotels, and venues", count: "50+" },
            ].map((cat) => (
              <div
                key={cat.name}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 hover:border-primary/20 transition-colors"
                data-testid={`material-category-${cat.name.toLowerCase()}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <cat.icon className="w-4 h-4 text-primary" size={16} />
                  </div>
                  <h4 className="text-xs font-semibold text-foreground">{cat.name}</h4>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{cat.desc}</p>
                <p className="text-[9px] text-muted-foreground/60 mt-1">{cat.count} icons</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
