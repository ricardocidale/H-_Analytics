import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPlus, IconTrash, IconImage, IconUpload, IconBuilding2, IconSave, IconStar } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import defaultLogo from "@/assets/logo.png";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";

interface Logo {
  id: number;
  name: string;
  companyName: string;
  url: string;
  isDefault: boolean;
  createdAt: string;
}

export default function Logos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [logoName, setLogoName] = useState("");
  const [logoCompanyName, setLogoCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: logos, isLoading } = useQuery<Logo[]>({
    queryKey: ["admin", "logos"],
    queryFn: async () => {
      const res = await fetch("/api/admin/logos", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logos");
      return res.json();
    },
  });

  const createLogoMutation = useMutation({
    mutationFn: async (data: { name: string; companyName: string; url: string }) => {
      const res = await fetch("/api/admin/logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create logo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "logos"] });
      queryClient.invalidateQueries({ queryKey: ["my-branding"] });
      setCreateDialogOpen(false);
      resetForm();
      toast({ title: "Logo Created", description: "Logo has been added successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create logo.", variant: "destructive" });
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/logos/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete logo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "logos"] });
      queryClient.invalidateQueries({ queryKey: ["my-branding"] });
      setDeleteConfirmId(null);
      toast({ title: "Logo Deleted", description: "Logo has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setLogoName("");
    setLogoCompanyName("");
    setLogoUrl("");
    setUploadedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Logo must be under 5MB.", variant: "destructive" });
      return;
    }

    setUploadingFile(true);
    try {
      const res = await fetch("/api/admin/logos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await res.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file");

      setLogoUrl(objectPath);
      const reader = new FileReader();
      reader.onload = (e) => setUploadedPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      toast({ title: "Uploaded", description: "Logo image uploaded successfully." });
    } catch (_error: unknown) {
      toast({ title: "Upload Failed", description: "Failed to upload logo image.", variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <AnimatedPage>
    <Layout>
      <div className="container mx-auto max-w-5xl py-8 px-4">
        <PageHeader
          title="Logo Management"
          subtitle="Upload, create, and manage logos used by companies in the platform"
          variant="dark"
        />

        <div className="flex justify-end mb-6">
          <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }} className="flex items-center gap-2" data-testid="button-add-logo">
            <IconPlus className="w-4 h-4" /> Add Logo
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !logos || logos.length === 0 ? (
          <Card className="bg-card border-border shadow-sm rounded-lg">
            <CardContent className="text-center py-16">
              <IconImage className="w-16 h-16 mx-auto mb-4 text-primary/30" />
              <p className="text-lg text-muted-foreground mb-2">No logos yet</p>
              <p className="text-sm text-muted-foreground">Click "Add Logo" to upload or create your first logo.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {logos.map(logo => (
              <Card key={logo.id} className="bg-card border border-border shadow-sm rounded-lg group hover:shadow-md transition-shadow" data-testid={`logo-card-${logo.id}`}>
                <CardContent className="p-6">
                  <div className="aspect-square bg-muted rounded-lg border border-border flex items-center justify-center p-6 mb-4 overflow-hidden">
                    <img
                      src={logo.url.startsWith("/objects/") ? logo.url : logo.url}
                      alt={logo.name}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).src = defaultLogo; }}
                      data-testid={`logo-image-${logo.id}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display font-medium text-foreground truncate flex items-center gap-2">
                          {logo.name}
                          {logo.isDefault && <IconStar className="w-4 h-4 text-accent-pop fill-accent-pop flex-shrink-0" />}
                        </h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <IconBuilding2 className="w-3.5 h-3.5" />
                          {logo.companyName}
                        </p>
                      </div>
                      {!logo.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmId(logo.id)}
                          className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          data-testid={`button-delete-logo-${logo.id}`}
                        >
                          <IconTrash className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {logo.isDefault && (
                      <span className="inline-block text-xs bg-accent-pop/20 text-accent-pop px-2 py-0.5 rounded">Default Logo</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add Logo</DialogTitle>
            <DialogDescription className="label-text">Upload an image or provide a URL for your logo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Logo Name</Label>
              <Input value={logoName} onChange={(e) => setLogoName(e.target.value)} placeholder="e.g., Norfolk Group Logo" data-testid="input-logo-name" />
            </div>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={logoCompanyName} onChange={(e) => setLogoCompanyName(e.target.value)} placeholder="e.g., Norfolk Group" data-testid="input-logo-company-name" />
            </div>
            <div className="space-y-3">
              <Label>Logo Image</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                {uploadedPreview ? (
                  <div className="space-y-3">
                    <div className="w-24 h-24 mx-auto rounded-lg bg-card border border-primary/20 flex items-center justify-center overflow-hidden">
                      <img src={uploadedPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                    </div>
                    <p className="text-sm text-primary font-medium">Image uploaded</p>
                    <Button variant="outline" size="sm" onClick={() => { setUploadedPreview(null); setLogoUrl(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <IconUpload className="w-10 h-10 mx-auto text-primary/40" />
                    <p className="text-sm text-muted-foreground">Drag and drop or click to upload</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
                      data-testid="input-logo-file"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile}
                      data-testid="button-upload-logo"
                    >
                      {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconUpload className="w-4 h-4 mr-2" />}
                      {uploadingFile ? "Uploading..." : "Choose File"}
                    </Button>
                  </div>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-primary/20" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or enter URL directly</span></div>
              </div>
              <Input
                value={uploadedPreview ? "" : logoUrl}
                onChange={(e) => { setLogoUrl(e.target.value); setUploadedPreview(null); }}
                placeholder="/logos/custom.png or https://..."
                disabled={!!uploadedPreview}
                data-testid="input-logo-url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }} data-testid="button-cancel-logo">Cancel</Button>
            <Button
              onClick={() => createLogoMutation.mutate({ name: logoName.trim(), companyName: logoCompanyName.trim(), url: logoUrl.trim() })}
              disabled={!logoName.trim() || !logoCompanyName.trim() || !logoUrl.trim() || createLogoMutation.isPending}
              data-testid="button-save-logo"
              className="flex items-center gap-2"
            >
              {createLogoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
              Save Logo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Logo</DialogTitle>
            <DialogDescription>Are you sure you want to delete this logo? Companies using it will need a new logo assigned.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirmId) deleteLogoMutation.mutate(deleteConfirmId); }} disabled={deleteLogoMutation.isPending}>
              {deleteLogoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconTrash className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
    </AnimatedPage>
  );
}
