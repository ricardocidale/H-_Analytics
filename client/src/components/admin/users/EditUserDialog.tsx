import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconEye, IconEyeOff, IconCalendar, IconSave, IconPeople, IconKey, IconShield, IconMail, IconUserCog, IconProperties, IconPlus, IconFileStack } from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { UserRole } from "@shared/constants";
import { formatDateTime } from "@/lib/formatters";
import type { User } from "../types";
import type { EditUserForm } from "./types";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: User | null;
  editUser: EditUserForm;
  setEditUser: React.Dispatch<React.SetStateAction<EditUserForm>>;
  showEditPassword: boolean;
  setShowEditPassword: React.Dispatch<React.SetStateAction<boolean>>;
  companiesList: { id: number; name: string; logoId: number | null; isActive: boolean }[] | undefined;
  companyLogoMap: Record<number, string>;
  isPending: boolean;
  onSubmit: () => void;
  onAddCompany: () => void;
}

export default function EditUserDialog({
  open,
  onOpenChange,
  selectedUser,
  editUser,
  setEditUser,
  showEditPassword,
  setShowEditPassword,
  companiesList,
  companyLogoMap,
  isPending,
  onSubmit,
  onAddCompany,
}: EditUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Edit User</DialogTitle>
          <DialogDescription className="label-text">Update user information</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {selectedUser?.createdAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <IconCalendar className="w-3.5 h-3.5" />
              Created {formatDateTime(selectedUser.createdAt)}
            </div>
          )}
          <div className="space-y-2"><Label className="flex items-center gap-2"><IconMail className="w-4 h-4 text-muted-foreground" />Email</Label><Input value={editUser.email} onChange={(e) => setEditUser(prev => ({ ...prev, email: e.target.value }))} data-testid="input-edit-email" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="flex items-center gap-2"><IconPeople className="w-4 h-4 text-muted-foreground" />First Name</Label><Input value={editUser.firstName} onChange={(e) => setEditUser(prev => ({ ...prev, firstName: e.target.value }))} data-testid="input-edit-firstName" /></div>
            <div className="space-y-2"><Label>Last Name</Label><Input value={editUser.lastName} onChange={(e) => setEditUser(prev => ({ ...prev, lastName: e.target.value }))} data-testid="input-edit-lastName" /></div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconProperties className="w-4 h-4 text-muted-foreground" />Company</Label>
            <Select value={editUser.companyId != null ? String(editUser.companyId) : "none"} onValueChange={(v) => {
              if (v === "__add_new__") { onAddCompany(); return; }
              setEditUser(prev => ({ ...prev, companyId: v === "none" ? null : parseInt(v) }));
            }} data-testid="select-edit-company">
              <SelectTrigger data-testid="select-edit-company"><SelectValue /></SelectTrigger>
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
          <div className="space-y-2"><Label className="flex items-center gap-2"><IconShield className="w-4 h-4 text-muted-foreground" />Title</Label><Input value={editUser.title} onChange={(e) => setEditUser(prev => ({ ...prev, title: e.target.value }))} data-testid="input-edit-title" /></div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconShield className="w-4 h-4 text-muted-foreground" />Role</Label>
            <Select value={editUser.role} onValueChange={(v) => setEditUser(prev => ({ ...prev, role: v }))} data-testid="select-edit-user-role">
              <SelectTrigger data-testid="select-edit-user-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.USER}>User</SelectItem>
                <SelectItem value={UserRole.INVESTOR}>Investor</SelectItem>
                <SelectItem value={UserRole.CHECKER}>Checker</SelectItem>
                <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label className="flex items-center gap-2 cursor-pointer"><IconFileStack className="w-4 h-4 text-muted-foreground" />Scenario Management</Label>
            <Switch
              checked={editUser.canManageScenarios}
              onCheckedChange={(checked) => setEditUser(prev => ({ ...prev, canManageScenarios: checked }))}
              data-testid="switch-edit-scenarios"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconKey className="w-4 h-4 text-muted-foreground" />Password</Label>
            <div className="relative">
              <Input type={showEditPassword ? "text" : "password"} value={editUser.password} onChange={(e) => setEditUser(prev => ({ ...prev, password: e.target.value }))} placeholder="Leave blank to keep current" data-testid="input-edit-password" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowEditPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground" data-testid="button-toggle-edit-password">
                {showEditPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to keep the current password unchanged</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">Cancel</Button>
          <Button variant="outline" onClick={onSubmit} disabled={isPending} data-testid="button-save-user" className="flex items-center gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
