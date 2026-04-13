import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles } from "@/components/icons/themed-icons";
import { IconDownload } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { USE_SERVER_EXPORTS } from "@shared/constants";

type ReportScope = "all" | "income" | "cashflow" | "balance" | "overview" | "investment";

const SCOPE_OPTIONS: { value: ReportScope; label: string; description: string }[] = [
  { value: "all", label: "Full Report", description: "All financial statements and analysis" },
  { value: "income", label: "Income Statement", description: "Revenue, expenses, and net income" },
  { value: "cashflow", label: "Cash Flow", description: "Operating, investing, and financing flows" },
  { value: "balance", label: "Balance Sheet", description: "Assets, liabilities, and equity position" },
  { value: "overview", label: "Portfolio Overview", description: "High-level performance summary" },
  { value: "investment", label: "Investment Analysis", description: "Returns, IRR, and equity multiples" },
];

const SCOPE_STORAGE_KEY = "export-report-scope";

export type ExportVersion = "short" | "extended";
export type PremiumFormat = "xlsx" | "pptx" | "pdf" | "docx";
export type ServerExportFormat = "pdf" | "xlsx" | "pptx" | "docx" | "csv";

export interface ServerExportConfig {
  entityType: "portfolio" | "property" | "company";
  entityId?: number;
  reportScope?: "all" | "income" | "cashflow" | "balance" | "overview" | "investment";
}

const ORIENTATION_KEY = "export-orientation";
const VERSION_KEY = "export-version";
const PREMIUM_KEY = "export-premium";
function getStoredOrientation(): "landscape" | "portrait" {
  try {
    const v = localStorage.getItem(ORIENTATION_KEY);
    if (v === "portrait") return "portrait";
  } catch { /* ignore */ }
  return "landscape";
}

function getStoredVersion(): ExportVersion {
  try {
    const v = localStorage.getItem(VERSION_KEY);
    if (v === "short" || v === "extended") return v;
  } catch { /* ignore */ }
  return "short";
}

function getStoredPremium(): boolean {
  try {
    return localStorage.getItem(PREMIUM_KEY) === "true";
  } catch { /* ignore */ }
  return false;
}

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (orientation: "landscape" | "portrait", version: ExportVersion, customFilename?: string) => void;
  title: string;
  showVersionOption?: boolean;
  allowShort?: boolean;
  allowExtended?: boolean;
  premiumExportData?: PremiumExportPayload | null;
  getPremiumExportData?: (version: ExportVersion) => PremiumExportPayload | null | Promise<PremiumExportPayload | null>;
  premiumFormat?: PremiumFormat;
  suggestedFilename?: string;
  fileExtension?: string;
  serverExportConfig?: ServerExportConfig;
}

export interface PremiumExportPayload {
  entityName: string;
  companyName?: string;
  statementType?: string;
  years?: string[];
  rows?: Array<{
    category: string;
    values: (string | number)[];
    indent?: number;
    isBold?: boolean;
    isHeader?: boolean;
    isItalic?: boolean;
  }>;
  statements?: Array<{
    title: string;
    years: string[];
    rows: Array<{
      category: string;
      values: (string | number)[];
      indent?: number;
      isBold?: boolean;
      isHeader?: boolean;
      isItalic?: boolean;
    }>;
    includeTable?: boolean;
    includeChart?: boolean;
  }>;
  metrics?: Array<{ label: string; value: string }>;
  chartScreenshots?: Array<{ title: string; dataUrl: string; aspectRatio?: number }>;
  projectionYears?: number;
  densePagination?: boolean;
  themeColors?: Array<{ name: string; hexCode: string; rank: number }>;
}

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function generatePremiumExport(
  format: PremiumFormat,
  payload: PremiumExportPayload,
  orientation: "landscape" | "portrait",
  version: ExportVersion,
): Promise<{ blob: Blob; serverFilename: string }> {
  const controller = new AbortController();
  const clientTimeout = setTimeout(() => controller.abort(), 300_000);
  let response;
  try {
    response = await fetch("/api/exports/premium", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ format, orientation, version, ...payload }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(clientTimeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Export timed out — the server took too long to respond. Please try again.");
    }
    throw err;
  }
  clearTimeout(clientTimeout);

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || `Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  let serverFilename = `export.${format}`;
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) serverFilename = match[1];
  }

  return { blob, serverFilename };
}

async function generateServerExport(
  config: ServerExportConfig,
  format: ServerExportFormat,
  orientation: "landscape" | "portrait",
  version: ExportVersion,
): Promise<{ blob: Blob; serverFilename: string }> {
  const controller = new AbortController();
  const clientTimeout = setTimeout(() => controller.abort(), 300_000);
  let response;
  try {
    response = await fetch("/api/exports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        entityType: config.entityType,
        entityId: config.entityId,
        format,
        orientation,
        version,
        reportScope: config.reportScope,
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(clientTimeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Export timed out — the server took too long to respond. Please try again.");
    }
    throw err;
  }
  clearTimeout(clientTimeout);

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || `Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  let serverFilename = `export.${format}`;
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) serverFilename = match[1];
  }

  return { blob, serverFilename };
}

type DialogStep = "options" | "generating";

const GENERATING_PHASES = [
  { label: "Analyzing financial data...", icon: "chart" },
  { label: "Building report structure...", icon: "layout" },
  { label: "Rendering premium layout...", icon: "sparkle" },
  { label: "Finalizing document...", icon: "doc" },
];

function GeneratingAnimation() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % GENERATING_PHASES.length);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  const current = GENERATING_PHASES[phase];

  return (
    <div className="py-8 flex flex-col items-center gap-5" data-testid="export-generating-animation">
      <div className="relative w-24 h-24">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(var(--foreground)), hsl(var(--primary)))",
            opacity: 0.15,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-1 rounded-full"
          style={{
            background: "conic-gradient(from 180deg, transparent 60%, hsl(var(--secondary)) 90%, transparent 100%)",
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        />
        <div className="absolute inset-2 rounded-full bg-background" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-10 h-12 flex flex-col items-center justify-center">
            <motion.div
              className="w-8 h-10 rounded-sm relative overflow-hidden"
              style={{
                border: "2px solid hsl(var(--accent-pop) / 0.8)",
                background: "linear-gradient(to bottom, hsl(var(--accent-pop) / 0.08), hsl(var(--background)))",
              }}
              animate={{ scale: [0.95, 1, 0.95] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="h-[2px] mx-1 mt-[3px] rounded-full"
                  style={{ background: "hsl(var(--accent-pop) / 0.4)" }}
                  initial={{ scaleX: 0, originX: 0 }}
                  animate={{ scaleX: [0, 1, 1, 0] }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    delay: i * 0.3,
                    ease: "easeInOut",
                  }}
                />
              ))}
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-1"
                animate={{ scaleX: [0, 1] }}
                transition={{ duration: 12, ease: "linear" }}
                style={{ originX: 0, background: "linear-gradient(to right, hsl(var(--accent-pop)), hsl(var(--accent-pop) / 0.5))" }}
              />
            </motion.div>
          </div>
        </div>

        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              top: "50%",
              left: "50%",
              background: "hsl(var(--accent-pop))",
            }}
            animate={{
              x: [0, Math.cos((i * 120 * Math.PI) / 180) * 44],
              y: [0, Math.sin((i * 120 * Math.PI) / 180) * 44],
              opacity: [0, 1, 0],
              scale: [0, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.7,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      <div className="text-center min-h-[48px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <p className="font-medium text-sm">{current.label}</p>
          </motion.div>
        </AnimatePresence>
        <p className="text-xs text-muted-foreground mt-1.5">This may take up to a minute for large reports.</p>
      </div>

      <div className="flex gap-1.5">
        {GENERATING_PHASES.map((_, i) => (
          <motion.div
            key={i}
            className="h-1 rounded-full"
            style={{ width: i === phase ? 20 : 6 }}
            animate={{
              backgroundColor: i === phase ? "hsl(var(--primary))" : i < phase ? "hsl(var(--primary) / 0.45)" : "hsl(var(--muted))",
              width: i === phase ? 20 : 6,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

export function ExportDialog({ open, onClose, onExport, title, showVersionOption = true, allowShort = true, allowExtended = true, premiumExportData, getPremiumExportData, premiumFormat = "pdf", suggestedFilename = "", fileExtension = ".pdf", serverExportConfig }: ExportDialogProps) {
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(getStoredOrientation);
  const [version, setVersion] = useState<ExportVersion>(getStoredVersion);
  const [isPremium, setIsPremium] = useState(getStoredPremium);
  const [step, setStep] = useState<DialogStep>("options");
  const [isSaving, setIsSaving] = useState(false);
  const [reportScope, setReportScope] = useState<ReportScope>(() => {
    try {
      const v = localStorage.getItem(SCOPE_STORAGE_KEY);
      if (v && SCOPE_OPTIONS.some(o => o.value === v)) return v as ReportScope;
    } catch { /* ignore */ }
    return "all";
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setOrientation(getStoredOrientation());
      const storedVer = getStoredVersion();
      const resolvedVer: ExportVersion =
        !allowShort && allowExtended ? "extended" :
        allowShort && !allowExtended ? "short" :
        storedVer;
      setVersion(resolvedVer);
      setIsPremium(premiumFormat === "docx" ? true : getStoredPremium());
      setStep("options");
      setIsSaving(false);
    }
  }, [open, premiumFormat, allowShort, allowExtended]);

  const handleOrientationChange = (v: string) => {
    const val = v as "landscape" | "portrait";
    setOrientation(val);
    try { localStorage.setItem(ORIENTATION_KEY, val); } catch { /* ignore */ }
  };

  const handleVersionChange = (v: string) => {
    const val = v as ExportVersion;
    setVersion(val);
    try { localStorage.setItem(VERSION_KEY, val); } catch { /* ignore */ }
  };

  const handleScopeChange = (v: string) => {
    const val = v as ReportScope;
    setReportScope(val);
    try { localStorage.setItem(SCOPE_STORAGE_KEY, val); } catch { /* ignore */ }
  };

  const handlePremiumToggle = (checked: boolean) => {
    setIsPremium(checked);
    try { localStorage.setItem(PREMIUM_KEY, String(checked)); } catch { /* ignore */ }
  };

  const resolvePremiumPayload = async (): Promise<PremiumExportPayload | null> => {
    if (getPremiumExportData) {
      return await getPremiumExportData(version);
    }
    return premiumExportData ?? null;
  };

  const hasPremiumData = !!(getPremiumExportData || premiumExportData);
  const isGenerating = step === "generating";

  const useServerPath = USE_SERVER_EXPORTS && !!serverExportConfig;

  const handleExport = async () => {
    if (useServerPath) {
      setStep("generating");
      try {
        const serverFormat = premiumFormat as ServerExportFormat;
        const configWithScope = { ...serverExportConfig!, reportScope: reportScope as ServerExportConfig["reportScope"] };
        const { blob, serverFilename } = await generateServerExport(configWithScope, serverFormat, orientation, version);
        setIsSaving(true);
        try {
          const { saveFile } = await import("@/lib/exports/saveFile");
          await saveFile(blob, serverFilename);
          toast({ title: "File saved", description: `${serverFilename} saved to your computer.` });
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") {
            onClose();
            return;
          }
          throw err;
        }
        onClose();
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
        console.error("[server-export] Client error:", errMsg);
        toast({ title: "Export failed", description: errMsg, variant: "destructive" });
        setStep("options");
        setIsSaving(false);
      }
      return;
    }

    const payload = await resolvePremiumPayload();
    if (isPremium && payload) {
      setStep("generating");
      try {
        const { blob, serverFilename } = await generatePremiumExport(premiumFormat, payload, orientation, version);

        setIsSaving(true);
        try {
          const { saveFile } = await import("@/lib/exports/saveFile");
          await saveFile(blob, serverFilename);
          toast({ title: "File saved", description: `${serverFilename} saved to your computer.` });
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") {
            onClose();
            return;
          }
          throw err;
        }
        onClose();
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
        toast({ title: "Premium export failed", description: errMsg, variant: "destructive" });
        setStep("options");
        setIsSaving(false);
      }
    } else {
      onExport(orientation, version);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isGenerating || isSaving) ? undefined : onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {step === "options" && (
          <>
            <div className="py-4 space-y-5">
              {hasPremiumData && !useServerPath && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-primary/30" style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--accent) / 0.15))' }}>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div>
                      <Label htmlFor="premium-toggle" className="text-sm font-medium cursor-pointer">Premium Export</Label>
                      <p className="text-xs text-muted-foreground">AI-enhanced formatting & insights</p>
                    </div>
                  </div>
                  <Switch
                    id="premium-toggle"
                    checked={isPremium}
                    onCheckedChange={handlePremiumToggle}
                    disabled={premiumFormat === "docx"}
                    data-testid="switch-premium-export"
                  />
                </div>
              )}

              <div>
                <Label className="text-sm font-medium mb-3 block">Orientation</Label>
                <RadioGroup value={orientation} onValueChange={handleOrientationChange}>
                  <div className="flex items-center space-x-2 mb-2">
                    <RadioGroupItem value="landscape" id="landscape" />
                    <Label htmlFor="landscape" className="cursor-pointer">Landscape (wider)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="portrait" id="portrait" />
                    <Label htmlFor="portrait" className="cursor-pointer">Portrait (taller)</Label>
                  </div>
                </RadioGroup>
              </div>

              {useServerPath && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-3 block">Report Sections</Label>
                  <RadioGroup value={reportScope} onValueChange={handleScopeChange}>
                    {SCOPE_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-start space-x-2 mb-2" data-testid={`scope-option-${opt.value}`}>
                        <RadioGroupItem value={opt.value} id={`scope-${opt.value}`} className="mt-0.5" />
                        <div className="grid gap-0.5 leading-none">
                          <Label htmlFor={`scope-${opt.value}`} className="cursor-pointer text-sm font-medium">{opt.label}</Label>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {showVersionOption && allowShort && allowExtended && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-3 block">Detail Level</Label>
                  <RadioGroup value={version} onValueChange={handleVersionChange}>
                    {allowShort && (
                      <div className="flex items-start space-x-2 mb-3">
                        <RadioGroupItem value="short" id="version-short" className="mt-0.5" />
                        <div className="grid gap-1 leading-none">
                          <Label htmlFor="version-short" className="cursor-pointer text-sm font-medium">Executive Summary</Label>
                          <p className="text-xs text-muted-foreground">Top-level figures and key metrics</p>
                        </div>
                      </div>
                    )}
                    {allowExtended && (
                      <div className="flex items-start space-x-2">
                        <RadioGroupItem value="extended" id="version-extended" className="mt-0.5" />
                        <div className="grid gap-1 leading-none">
                          <Label htmlFor="version-extended" className="cursor-pointer text-sm font-medium">Full Detail</Label>
                          <p className="text-xs text-muted-foreground">Complete line-item breakdowns</p>
                        </div>
                      </div>
                    )}
                  </RadioGroup>
                </div>
              )}

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                variant="outline"
                onClick={handleExport}
                data-testid="button-export-confirm"
              >
                {isPremium && hasPremiumData ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Export
                  </>
                ) : (
                  <>
                    <IconDownload className="mr-2 h-4 w-4" />
                    Export
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "generating" && (
          <GeneratingAnimation />
        )}
      </DialogContent>
    </Dialog>
  );
}
