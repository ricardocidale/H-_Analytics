import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ArrowRight, X, Check } from "@/components/icons/themed-icons";
import { IconPlus, IconSave, IconStar, IconSparkles, IconHardDrive, IconLink, IconWand2, IconTrash, IconProperties, IconImage, IconTag, IconPencil } from "@/components/icons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { useAdminLogos, useCreateLogo, useDeleteLogo, useSetDefaultLogo, useEnhanceLogoPrompt, useGenerateLogoImage } from "./hooks";
import { useAuth } from "@/lib/auth";
import defaultLogo from "@/assets/logo.png";

type LogoMode = "generate" | "import" | "url";
type AIStep = "describe" | "enhancing" | "review" | "generating";
type LogoStyle = "modern" | "neutral" | "traditional";

export default function LogosTab() {
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();

  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [logoName, setLogoName] = useState("");
  const [logoCompanyName, setLogoCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoMode, setLogoMode] = useState<LogoMode>("generate");
  const [deleteLogoConfirmId, setDeleteLogoConfirmId] = useState<number | null>(null);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStep, setAiStep] = useState<AIStep>("describe");
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [logoStyle, setLogoStyle] = useState<LogoStyle>("neutral");
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ src: string; name: string; type: string; originalFile: File } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");


  const { data: adminLogos } = useAdminLogos();
  const createLogoMutation = useCreateLogo();
  const deleteLogoMutation = useDeleteLogo();
  const setDefaultLogoMutation = useSetDefaultLogo();

  const { enhance, isEnhancing } = useEnhanceLogoPrompt();
  const { generate, isGenerating } = useGenerateLogoImage();

  const resetLogoForm = () => {
    setLogoName("");
    setLogoCompanyName("");
    setLogoUrl("");
    setAiPrompt("");
    setAiStep("describe");
    setEnhancedPrompt("");
    setLogoStyle("neutral");
    setIsUploadingFile(false);
    setUrlInput("");
    setLogoMode("generate");
  };

  const { uploadFile } = useUpload({
    onSuccess: (response) => {
      setLogoUrl(response.objectPath);
      setIsUploadingFile(false);
      toast({ title: "Image Uploaded", description: "Logo image uploaded successfully." });
    },
    onError: () => {
      setIsUploadingFile(false);
      toast({ title: "Upload Failed", description: "Failed to upload image. Please try again.", variant: "destructive" });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Please select an image under 5MB.", variant: "destructive" });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPendingImage({ src: objectUrl, name: file.name, type: file.type, originalFile: file });
    setCropDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = async (croppedFile: File) => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.src);
    setIsUploadingFile(true);
    const fileToUpload = croppedFile.size === 0 ? pendingImage!.originalFile : croppedFile;
    await uploadFile(fileToUpload);
    setPendingImage(null);
  };

  const handleCropDialogClose = (open: boolean) => {
    if (!open && pendingImage) {
      URL.revokeObjectURL(pendingImage.src);
      setPendingImage(null);
    }
    setCropDialogOpen(open);
  };

  const stylePrefix = (style: LogoStyle) =>
    style === "modern" ? "Modern, clean, minimalist style. " :
    style === "traditional" ? "Traditional, classic, timeless style. " : "";

  const handleEnhancePrompt = async () => {
    if (!aiPrompt.trim()) return;
    setAiStep("enhancing");
    const result = await enhance(aiPrompt.trim(), logoStyle);
    if (result) {
      setEnhancedPrompt(result);
      setAiStep("review");
    } else {
      toast({ title: "Enhancement Failed", description: "Could not enhance prompt. You can still generate with your original description.", variant: "destructive" });
      setAiStep("describe");
    }
  };

  const handleGenerateLogo = async (prompt: string) => {
    setAiStep("generating");
    const objectPath = await generate(prompt);
    if (objectPath) {
      setLogoUrl(objectPath);
      setAiStep("describe");
      toast({ title: "Logo Generated", description: "AI-generated logo is ready." });
    } else {
      toast({ title: "Generation Failed", description: "Failed to generate logo. Please try again.", variant: "destructive" });
      setAiStep("describe");
    }
  };

  const modeBtn = (mode: LogoMode, active: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
      active
        ? "bg-gradient-to-b from-primary/15 to-primary/25 border-primary/40 text-foreground shadow-sm"
        : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted"
    }`;

  const isBusy = isGenerating || isEnhancing || isUploadingFile || createLogoMutation.isPending;

  const visibleLogos = adminLogos?.filter(l => isSuperAdmin || l.visibility !== "super_admin_only");

  return (
    <>
    <div className="space-y-6">
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2"><IconImage className="w-4 h-4 text-muted-foreground" /> Management Company Logos</CardTitle>
              <CardDescription className="label-text">Logo pool for your management company. The default logo is used when no specific logo is assigned.</CardDescription>
            </div>
            <Button variant="outline" onClick={() => { resetLogoForm(); setLogoDialogOpen(true); }} className="flex items-center gap-2" data-testid="button-add-logo">
              <IconPlus className="w-4 h-4" /> Add Logo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="relative space-y-4">
          {!visibleLogos || visibleLogos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IconImage className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg mb-1">No logos yet</p>
              <p className="text-sm">Click "Add Logo" to upload or create your first logo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...visibleLogos].sort((a, b) => {
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                return a.name.localeCompare(b.name);
              }).map(logo => (
                <Card key={logo.id} className="bg-transparent border-none shadow-none group" data-testid={`logo-card-${logo.id}`}>
                  <CardContent className="p-0">
                    <div className="aspect-square overflow-hidden rounded-xl shadow-sm bg-muted/30 border border-border/60">
                      <img src={logo.url} alt={logo.name} className="w-full h-full object-contain p-3" onError={(e) => { (e.target as HTMLImageElement).src = defaultLogo; }} data-testid={`logo-image-${logo.id}`} />
                    </div>
                    <div className="space-y-1 px-1 py-2">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display font-medium text-xs text-foreground truncate flex items-center gap-1">
                            {logo.name}
                            {logo.isDefault && <IconStar className="w-3 h-3 text-accent-pop fill-accent-pop flex-shrink-0" />}
                          </h3>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                            <IconProperties className="w-3 h-3 flex-shrink-0" />
                            {logo.companyName}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {!logo.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDefaultLogoMutation.mutate(logo.id)}
                              disabled={setDefaultLogoMutation.isPending}
                              className="text-muted-foreground hover:text-accent-pop hover:bg-accent-pop/10 h-6 w-6 p-0"
                              title="Set as default"
                              data-testid={`button-set-default-${logo.id}`}
                            >
                              <IconStar className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!logo.isDefault && !logo.isAppLogo && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteLogoConfirmId(logo.id)} className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0" data-testid={`button-delete-logo-${logo.id}`}>
                              <IconTrash className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {logo.isDefault && (
                        <span className="inline-block text-[10px] bg-accent-pop/20 text-accent-pop px-1.5 py-0.5 rounded">Default</span>
                      )}
                      {logo.isAppLogo && !logo.isDefault && (
                        <span className="inline-block text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">App Logo</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>

    <Dialog open={logoDialogOpen} onOpenChange={(open) => { if (!isBusy) { setLogoDialogOpen(open); if (!open) resetLogoForm(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Add New Logo</DialogTitle>
          <DialogDescription className="label-text">Choose how you'd like to create your logo</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-foreground"><IconTag className="w-3.5 h-3.5 text-muted-foreground/60" />Logo Name</Label>
              <Input value={logoName} onChange={(e) => setLogoName(e.target.value)} placeholder="e.g., Company Logo" disabled={isBusy} data-testid="input-logo-name" className="bg-card border-border" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-foreground"><IconProperties className="w-3.5 h-3.5 text-muted-foreground/60" />Company Name</Label>
              <Input value={logoCompanyName} onChange={(e) => setLogoCompanyName(e.target.value)} placeholder="e.g., Hotel Group" disabled={isBusy} data-testid="input-logo-company-name" className="bg-card border-border" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant={logoMode === "generate" ? "default" : "outline"} disabled={isBusy} onClick={() => { setLogoMode("generate"); setLogoUrl(""); }} className={modeBtn("generate", logoMode === "generate")} data-testid="btn-mode-generate">
              <IconSparkles className="w-4 h-4" /> Generate Logo
            </Button>
            <Button type="button" variant={logoMode === "import" ? "default" : "outline"} disabled={isBusy} onClick={() => { setLogoMode("import"); setLogoUrl(""); setAiStep("describe"); }} className={modeBtn("import", logoMode === "import")} data-testid="btn-mode-import">
              <IconHardDrive className="w-4 h-4" /> Import Logo
            </Button>
            <Button type="button" variant={logoMode === "url" ? "default" : "outline"} disabled={isBusy} onClick={() => { setLogoMode("url"); setLogoUrl(""); setAiStep("describe"); }} className={modeBtn("url", logoMode === "url")} data-testid="btn-mode-url">
              <IconLink className="w-4 h-4" /> URL Logo
            </Button>
          </div>

          {logoUrl && (
            <div className="relative">
              <div className="aspect-square max-w-[200px] mx-auto rounded-xl overflow-hidden border-2 border-border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
                <img src={logoUrl} alt="Preview" className="w-full h-full object-contain" />
              </div>
              <Button type="button" variant="destructive" size="icon" onClick={() => { setLogoUrl(""); setAiStep("describe"); }} className="absolute top-2 right-2 w-7 h-7 rounded-full shadow-md" data-testid="btn-remove-preview">
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {!logoUrl && logoMode === "generate" && (
            <div className="space-y-3">
              {aiStep === "describe" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm">Describe your logo</Label>
                    <Textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="e.g., Minimalist logo for a boutique hotel management company with elegant green tones..."
                      rows={3}
                      disabled={isBusy}
                      className="resize-none bg-card border-border text-sm"
                      data-testid="input-ai-prompt"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-foreground text-sm">Style</Label>
                    <RadioGroup
                      value={logoStyle}
                      onValueChange={(v) => setLogoStyle(v as LogoStyle)}
                      className="flex gap-4"
                      disabled={isBusy}
                      data-testid="radio-logo-style"
                    >
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="modern" id="style-modern" data-testid="radio-style-modern" />
                        <Label htmlFor="style-modern" className="text-sm cursor-pointer">Modern</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="neutral" id="style-neutral" data-testid="radio-style-neutral" />
                        <Label htmlFor="style-neutral" className="text-sm cursor-pointer">Neutral</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="traditional" id="style-traditional" data-testid="radio-style-traditional" />
                        <Label htmlFor="style-traditional" className="text-sm cursor-pointer">Traditional</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" disabled={!aiPrompt.trim() || isBusy} onClick={handleEnhancePrompt} className="flex-1 bg-gradient-to-b from-accent-pop/10 to-accent-pop/15 border-accent-pop/20 text-accent-pop hover:from-accent-pop/15 hover:to-accent-pop/20 hover:border-accent-pop/30 transition-all" data-testid="btn-enhance-prompt">
                      <IconWand2 className="w-4 h-4 mr-2" />
                      Enhance with AI
                    </Button>
                    <Button type="button" variant="outline" disabled={!aiPrompt.trim() || isBusy} onClick={() => handleGenerateLogo((logoStyle !== "neutral" ? stylePrefix(logoStyle) : "") + aiPrompt.trim())} className="flex-1 bg-gradient-to-b from-primary/10 to-primary/20 border-primary/30 text-foreground hover:from-primary/20 hover:to-primary/30 transition-all" data-testid="btn-generate-direct">
                      <IconSparkles className="w-4 h-4 mr-2" />
                      Generate Logo
                    </Button>
                  </div>
                </>
              )}

              {aiStep === "enhancing" && (
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-pop/15 to-accent-pop/20 flex items-center justify-center">
                      <IconWand2 className="w-6 h-6 text-accent-pop animate-pulse" />
                    </div>
                    <Loader2 className="w-16 h-16 text-accent-pop animate-spin absolute -top-2 -left-2" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Enhancing your description...</p>
                  <p className="text-xs text-muted-foreground">AI is crafting a better prompt</p>
                </div>
              )}

              {aiStep === "review" && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-accent-pop/20 bg-gradient-to-b from-accent-pop/10 to-white p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <IconWand2 className="w-4 h-4 text-accent-pop" />
                      <span className="text-xs font-medium text-accent-pop uppercase tracking-wide">AI-Enhanced Prompt</span>
                    </div>
                    <Textarea value={enhancedPrompt} onChange={(e) => setEnhancedPrompt(e.target.value)} rows={4} className="resize-none bg-card border-border text-sm" data-testid="input-enhanced-prompt" />
                    <p className="text-xs text-muted-foreground">You can edit the enhanced prompt above</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => { setAiStep("describe"); setEnhancedPrompt(""); }} className="border-border text-muted-foreground hover:bg-muted" data-testid="btn-cancel-enhance">
                      <X className="w-4 h-4 mr-1.5" /> Cancel
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setAiPrompt(enhancedPrompt); setAiStep("describe"); setEnhancedPrompt(""); }} className="border-primary/30 text-foreground hover:bg-muted" data-testid="btn-edit-enhanced">
                      <IconPencil className="w-4 h-4 mr-1.5" /> Edit Further
                    </Button>
                    <Button type="button" onClick={() => handleGenerateLogo(enhancedPrompt)} className="flex-1 bg-gradient-to-b from-primary/70 to-primary/90 text-primary-foreground hover:from-primary/80 hover:to-primary border-0 shadow-sm" data-testid="btn-generate-enhanced">
                      <ArrowRight className="w-4 h-4 mr-1.5" /> Generate Logo
                    </Button>
                  </div>
                </div>
              )}

              {aiStep === "generating" && (
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                      <IconSparkles className="w-6 h-6 text-muted-foreground animate-pulse" />
                    </div>
                    <Loader2 className="w-16 h-16 text-muted-foreground/40 animate-spin absolute -top-2 -left-2" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Generating your logo...</p>
                  <p className="text-xs text-muted-foreground">AI is creating your design</p>
                </div>
              )}
            </div>
          )}

          {!logoUrl && logoMode === "import" && (
            <div className="w-full aspect-square max-h-[220px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center transition-colors cursor-pointer hover:border-border hover:bg-muted/30" onClick={() => !isUploadingFile && fileInputRef.current?.click()}>
              {isUploadingFile ? (
                <>
                  <Loader2 className="w-10 h-10 text-muted-foreground animate-spin mb-2" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </>
              ) : (
                <>
                  <IconHardDrive className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Click to import logo</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG — Max 5MB</p>
                </>
              )}
            </div>
          )}

          {!logoUrl && logoMode === "url" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://example.com/logo.png" className="bg-card border-border" data-testid="input-logo-url" />
                <Button type="button" variant="outline" onClick={() => { setLogoUrl(urlInput.trim()); setUrlInput(""); }} disabled={!urlInput.trim()} className="border-primary/30 text-foreground" data-testid="btn-apply-url">
                  <Check className="w-4 h-4 mr-1.5" /> Apply
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Paste a direct link to a logo image</p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" onClick={() => { setLogoDialogOpen(false); resetLogoForm(); }} disabled={isBusy} className="border-border" data-testid="button-cancel-logo">Cancel</Button>
          <Button
            variant="outline"
            onClick={() => {
              createLogoMutation.mutate({ name: logoName, companyName: logoCompanyName, url: logoUrl }, {
                onSuccess: () => { setLogoDialogOpen(false); resetLogoForm(); }
              });
            }}
            disabled={!logoName || !logoUrl || isBusy}
            className="bg-gradient-to-b from-primary/10 to-primary/20 border-primary/30 text-foreground hover:from-primary/20 hover:to-primary/30 flex items-center gap-2"
            data-testid="button-save-logo"
          >
            {createLogoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
            Save Logo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={deleteLogoConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteLogoConfirmId(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Delete Logo</DialogTitle>
          <DialogDescription className="label-text">Are you sure you want to delete this logo? This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteLogoConfirmId(null)} data-testid="button-cancel-delete-logo">Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => { if (deleteLogoConfirmId) deleteLogoMutation.mutate(deleteLogoConfirmId, { onSuccess: () => setDeleteLogoConfirmId(null) }); }}
            disabled={deleteLogoMutation.isPending}
            data-testid="button-confirm-delete-logo"
            className="flex items-center gap-2"
          >
            {deleteLogoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconTrash className="w-4 h-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
    {pendingImage && (
      <ImageCropDialog open={cropDialogOpen} onOpenChange={handleCropDialogClose} imageSrc={pendingImage.src} fileName={pendingImage.name} fileType={pendingImage.type} onCropComplete={handleCropComplete} aspectRatio={1} />
    )}
    </>
  );
}
