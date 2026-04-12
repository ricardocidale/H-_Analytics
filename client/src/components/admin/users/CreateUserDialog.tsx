import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconEye, IconEyeOff, IconSave, IconPeople, IconKey, IconShield, IconMail, IconUserCog, IconProperties, IconPlus } from "@/components/icons";
import { UserRole } from "@shared/constants";
import type { NewUserForm } from "./types";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newUser: NewUserForm;
  setNewUser: React.Dispatch<React.SetStateAction<NewUserForm>>;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  companiesList: { id: number; name: string; logoId: number | null; isActive: boolean }[] | undefined;
  companyLogoMap: Record<number, string>;
  isPending: boolean;
  onSubmit: () => void;
  onAddCompany: () => void;
}

export default function CreateUserDialog({
  open,
  onOpenChange,
  newUser,
  setNewUser,
  showPassword,
  setShowPassword,
  companiesList,
  companyLogoMap,
  isPending,
  onSubmit,
  onAddCompany,
}: CreateUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Add New User</DialogTitle>
          <DialogDescription className="label-text">Create a new user account</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconMail className="w-4 h-4 text-muted-foreground" />Email</Label>
            <Input value={newUser.email} onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))} placeholder="user@example.com" data-testid="input-new-user-email" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconKey className="w-4 h-4 text-muted-foreground" />Password <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={newUser.password} onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))} placeholder="Leave blank for Google-only sign-in" data-testid="input-new-user-password" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground" data-testid="button-toggle-new-password">
                {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="flex items-center gap-2"><IconPeople className="w-4 h-4 text-muted-foreground" />First Name</Label><Input value={newUser.firstName} onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))} placeholder="First name" data-testid="input-new-user-firstName" /></div>
            <div className="space-y-2"><Label>Last Name</Label><Input value={newUser.lastName} onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))} placeholder="Last name" data-testid="input-new-user-lastName" /></div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconProperties className="w-4 h-4 text-muted-foreground" />Company</Label>
            <Select value={newUser.companyId != null ? String(newUser.companyId) : "none"} onValueChange={(v) => {
              if (v === "__add_new__") { onAddCompany(); return; }
              setNewUser(prev => ({ ...prev, companyId: v === "none" ? null : parseInt(v) }));
            }} data-testid="select-new-user-company">
              <SelectTrigger data-testid="select-new-user-company"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Company</SelectItem>
                {companiesList?.filter(c => c.isActive).map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      {companyLogoMap[c.id] && <img src={companyLogoMap[c.id]} alt="" className="w-5 h-5 rounded object-contain" />}
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="__add_new__"><span className="flex items-center gap-2 text-primary"><IconPlus className="w-4 h-4" />Add New Company</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label className="flex items-center gap-2"><IconShield className="w-4 h-4 text-muted-foreground" />Title</Label><Input value={newUser.title} onChange={(e) => setNewUser(prev => ({ ...prev, title: e.target.value }))} placeholder="Job title" data-testid="input-new-user-title" /></div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconShield className="w-4 h-4 text-muted-foreground" />Role</Label>
            <Select value={newUser.role} onValueChange={(v) => setNewUser(prev => ({ ...prev, role: v }))} data-testid="select-new-user-role">
              <SelectTrigger data-testid="select-new-user-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.USER}>User</SelectItem>
                <SelectItem value={UserRole.INVESTOR}>Investor</SelectItem>
                <SelectItem value={UserRole.CHECKER}>Checker</SelectItem>
                <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-add-user">Cancel</Button>
          <Button variant="outline" onClick={onSubmit} disabled={isPending || !newUser.email} data-testid="button-create-user" className="flex items-center gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
