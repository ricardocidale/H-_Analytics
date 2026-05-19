/**
 * BrandFormDialog.tsx — Create / edit dialog for H+ brand flags.
 *
 * mode="create" — POSTs to POST /api/admin/brands. Slug auto-derives from
 *   name until the user manually edits the slug field (override-lock pattern).
 * mode="edit"   — PATCHes to PATCH /api/admin/brands/:slug. Slug is immutable
 *   and shown read-only with an "(immutable)" hint.
 *
 * Reference pattern: CreateUserDialog / EditUserDialog in components/admin/users/.
 */

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { useToast } from "@/hooks/use-toast";

interface BrandRow {
  id: number;
  name: string;
  slug: string;
  businessModel: string | null;
  segment: string | null;
  description?: string | null;
  isActive: boolean;
  isDefault: boolean;
}

interface BrandFormDialogProps {
  mode: "create" | "edit";
  brand?: BrandRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface CreateBrandPayload {
  slug: string;
  name: string;
  description?: string;
  businessModel?: string;
  segment?: string;
  isActive?: boolean;
}

interface UpdateBrandPayload {
  name?: string;
  description?: string;
  businessModel?: string;
  segment?: string;
  isActive?: boolean;
}

async function parseApiError(res: Response, fallback = "Request failed"): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

const toSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function BrandFormDialog({
  mode,
  brand,
  open,
  onOpenChange,
  onSuccess,
}: BrandFormDialogProps) {
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [segment, setSegment] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const slugManuallyEdited = useRef(false);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && brand) {
        setName(brand.name);
        setSlug(brand.slug);
        setBusinessModel(brand.businessModel ?? "");
        setSegment(brand.segment ?? "");
        setDescription(brand.description ?? "");
        setIsActive(brand.isActive);
      } else {
        setName("");
        setSlug("");
        setBusinessModel("");
        setSegment("");
        setDescription("");
        setIsActive(true);
        slugManuallyEdited.current = false;
      }
    }
  }, [open, mode, brand]);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugManuallyEdited.current) {
      setSlug(toSlug(v));
    }
  };

  const handleSlugChange = (v: string) => {
    slugManuallyEdited.current = true;
    setSlug(v);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      slugManuallyEdited.current = false;
    }
    onOpenChange(nextOpen);
  };

  const createMutation = useMutation({
    mutationFn: async (data: CreateBrandPayload) => {
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
    },
    onSuccess: () => {
      toast({ title: "Brand created" });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: UpdateBrandPayload) => {
      const res = await fetch(`/api/admin/brands/${brand!.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
    },
    onSuccess: () => {
      toast({ title: "Brand updated" });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isPending = createMutation.isPending || editMutation.isPending;

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (mode === "create") {
      if (!slug.trim()) {
        toast({ title: "Slug is required", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        slug: slug.trim(),
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(businessModel && { businessModel }),
        ...(segment.trim() && { segment: segment.trim() }),
        isActive,
      });
    } else {
      editMutation.mutate({
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(businessModel && { businessModel }),
        ...(segment.trim() && { segment: segment.trim() }),
        isActive,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New brand" : "Edit brand"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Name <span className="text-destructive">*</span></Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Marriott"
              data-testid="input-brand-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-slug">
              Slug{" "}
              {mode === "create" ? (
                <span className="text-xs text-muted-foreground font-normal">(auto-filled from name)</span>
              ) : (
                <span className="text-xs text-muted-foreground font-normal">(immutable)</span>
              )}
            </Label>
            <Input
              id="brand-slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="e.g. marriott"
              disabled={mode === "edit"}
              className={mode === "edit" ? "opacity-60" : ""}
              data-testid="input-brand-slug"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-business-model">Business Model</Label>
            <Select
              value={businessModel || "__none__"}
              onValueChange={(v) => setBusinessModel(v === "__none__" ? "" : v)}
            >
              <SelectTrigger id="brand-business-model" data-testid="select-brand-business-model">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not set</SelectItem>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="str">STR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-segment">Segment</Label>
            <Input
              id="brand-segment"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="e.g. Luxury, Boutique"
              data-testid="input-brand-segment"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-description">Description</Label>
            <Textarea
              id="brand-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — brief notes about this brand flag"
              maxLength={255}
              className="resize-none min-h-[72px]"
              data-testid="input-brand-description"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="brand-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              data-testid="switch-brand-active"
            />
            <Label htmlFor="brand-active">Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            data-testid="button-cancel-brand-form"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !name.trim() || (mode === "create" && !slug.trim())}
            data-testid="button-save-brand-form"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
