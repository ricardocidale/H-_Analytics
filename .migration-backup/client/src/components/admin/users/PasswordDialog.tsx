import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconEye, IconEyeOff, IconKey } from "@/components/icons";
import type { User } from "../types";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: User | null;
  newPassword: string;
  setNewPassword: React.Dispatch<React.SetStateAction<string>>;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  isPending: boolean;
  onSubmit: () => void;
}

export default function PasswordDialog({
  open,
  onOpenChange,
  selectedUser,
  newPassword,
  setNewPassword,
  showPassword,
  setShowPassword,
  isPending,
  onSubmit,
}: PasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Change Password</DialogTitle>
          <DialogDescription className="label-text">Set a new password for {selectedUser?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><IconKey className="w-4 h-4 text-muted-foreground" />New Password</Label>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" data-testid="input-new-password" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground" data-testid="button-toggle-change-password">
                {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-password">Cancel</Button>
          <Button variant="outline" onClick={onSubmit} disabled={isPending || !newPassword} data-testid="button-update-password" className="flex items-center gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconKey className="w-4 h-4" />}
            Save Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
