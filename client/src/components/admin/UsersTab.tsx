import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconKey, IconUserPlus, IconSend } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useAdminUsers } from "./hooks";
import { useAuth } from "@/lib/auth";
import { UserRole } from "@shared/constants";
import type { User } from "./types";
import type { SortField, SortDir } from "./users/types";
import { defaultNewUser, defaultEditUser } from "./users/types";
import UserCardGrid from "./users/UserCardGrid";
import CreateUserDialog from "./users/CreateUserDialog";
import EditUserDialog from "./users/EditUserDialog";
import PasswordDialog from "./users/PasswordDialog";
import ResetAllDialog from "./users/ResetAllDialog";
import InviteUsersDialog from "./users/InviteUsersDialog";
import DefaultPropertiesDialog from "./users/DefaultPropertiesDialog";

export default function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newUser, setNewUser] = useState(defaultNewUser);
  const [editUser, setEditUser] = useState(defaultEditUser);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [sortField, setSortField] = useState<SortField>("company");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [resetAllPassword, setResetAllPassword] = useState("");
  const [resetAllConfirm, setResetAllConfirm] = useState("");
  const [resetAllDialogOpen, setResetAllDialogOpen] = useState(false);
  const [showResetAllPassword, setShowResetAllPassword] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [defaultsDialogOpen, setDefaultsDialogOpen] = useState(false);
  const [defaultsUser, setDefaultsUser] = useState<User | null>(null);

  const { data: users, isLoading: usersLoading } = useAdminUsers();

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedUsers = useMemo(() => {
    if (!users) return [];
    return [...users].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "company": {
          const ca = a.company || "";
          const cb = b.company || "";
          cmp = ca.localeCompare(cb);
          if (cmp === 0) cmp = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, sortField, sortDir]);

  const createMutation = useMutation({
    mutationFn: async (data: { email: string; password?: string; firstName?: string; lastName?: string; company?: string; title?: string; role?: string }) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setDialogOpen(false);
      setNewUser({ ...defaultNewUser });
      toast({ title: "User Created", description: "New user has been registered." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete user");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "User Deleted", description: "User has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const res = await fetch(`/api/admin/users/${id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update password");
      }
      return { id };
    },
    onSuccess: () => {
      setPasswordDialogOpen(false);
      setSelectedUser(null);
      setNewPassword("");
      toast({ title: "Password Updated", description: "User password has been changed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetAllPasswordsMutation = useMutation({
    mutationFn: async ({ password, confirm }: { password: string; confirm: string }) => {
      const res = await fetch("/api/admin/reset-all-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to reset passwords");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResetAllDialogOpen(false);
      setResetAllPassword("");
      setResetAllConfirm("");
      setShowResetAllPassword(false);
      toast({ title: "Passwords Reset", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { email?: string; firstName?: string; lastName?: string; company?: string; title?: string; role?: string; canManageScenarios?: boolean } }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          throw new Error(`Server returned ${res.status} (non-JSON)`);
        }
        const err = await res.json();
        throw new Error(err.error || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setEditDialogOpen(false);
      setSelectedUser(null);
      toast({ title: "User Updated", description: "User information has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setOriginalEmail(user.email);
    setEditUser({
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      company: user.company || "",
      title: user.title || "",
      role: user.role || UserRole.USER,
      password: "",
      canManageScenarios: user.canManageScenarios ?? true,
    });
    setShowEditPassword(false);
    setEditDialogOpen(true);
  };

  const handlePasswordUser = (user: User) => {
    setSelectedUser(user);
    setPasswordDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    createMutation.mutate(newUser);
  };

  const handleEditSubmit = () => {
    if (!selectedUser) return;
    const data: { email?: string; firstName?: string; lastName?: string; company?: string; title?: string; role?: string; canManageScenarios?: boolean } = {
      firstName: editUser.firstName,
      lastName: editUser.lastName,
      company: editUser.company,
      title: editUser.title,
      canManageScenarios: editUser.canManageScenarios,
    };
    if (editUser.email !== originalEmail) {
      data.email = editUser.email;
    }
    if (editUser.role !== selectedUser.role) {
      data.role = editUser.role;
    }
    if (editUser.password) {
      passwordMutation.mutate({ id: selectedUser.id, password: editUser.password });
    }
    editMutation.mutate({ id: selectedUser.id, data });
  };

  return (
    <>
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">User Management</CardTitle>
            <CardDescription className="label-text">
              {users?.length || 0} registered users
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={resetAllPasswordsMutation.isPending} data-testid="button-reset-all-passwords" onClick={() => setResetAllDialogOpen(true)}>
              {resetAllPasswordsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconKey className="w-4 h-4" />}
              Reset All Passwords
            </Button>
            <Button variant="outline" onClick={() => setInviteOpen(true)} data-testid="button-invite-users">
              <IconSend className="w-4 h-4" />
              Invite Users
            </Button>
            <Button variant="default" onClick={() => setDialogOpen(true)} data-testid="button-add-user">
              <IconUserPlus className="w-4 h-4" />
              Add User
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        {usersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <UserCardGrid
            sortedUsers={sortedUsers}
            sortField={sortField}
            sortDir={sortDir}
            toggleSort={toggleSort}
            currentUserRole={user?.role}
            onEditUser={handleEditUser}
            onPasswordUser={handlePasswordUser}
            onDeleteUser={(id) => deleteMutation.mutate(id)}
            onToggleScenarios={(userId, value) => {
              editMutation.mutate({ id: userId, data: { canManageScenarios: value } });
            }}
            onManageDefaults={(user) => { setDefaultsUser(user); setDefaultsDialogOpen(true); }}
          />
        )}
      </CardContent>
    </Card>

    <ResetAllDialog
      open={resetAllDialogOpen}
      onOpenChange={setResetAllDialogOpen}
      password={resetAllPassword}
      setPassword={setResetAllPassword}
      confirm={resetAllConfirm}
      setConfirm={setResetAllConfirm}
      showPassword={showResetAllPassword}
      setShowPassword={setShowResetAllPassword}
      isPending={resetAllPasswordsMutation.isPending}
      onSubmit={() => resetAllPasswordsMutation.mutate({ password: resetAllPassword, confirm: resetAllConfirm })}
    />

    <CreateUserDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      newUser={newUser}
      setNewUser={setNewUser}
      showPassword={showNewUserPassword}
      setShowPassword={setShowNewUserPassword}
      isPending={createMutation.isPending}
      onSubmit={handleCreateSubmit}
    />

    <PasswordDialog
      open={passwordDialogOpen}
      onOpenChange={setPasswordDialogOpen}
      selectedUser={selectedUser}
      newPassword={newPassword}
      setNewPassword={setNewPassword}
      showPassword={showChangePassword}
      setShowPassword={setShowChangePassword}
      isPending={passwordMutation.isPending}
      onSubmit={() => selectedUser && passwordMutation.mutate({ id: selectedUser.id, password: newPassword })}
    />

    <EditUserDialog
      open={editDialogOpen}
      onOpenChange={setEditDialogOpen}
      selectedUser={selectedUser}
      editUser={editUser}
      setEditUser={setEditUser}
      showEditPassword={showEditPassword}
      setShowEditPassword={setShowEditPassword}
      isPending={editMutation.isPending}
      onSubmit={handleEditSubmit}
    />

    <InviteUsersDialog
      open={inviteOpen}
      onOpenChange={setInviteOpen}
    />

    {defaultsUser && (
      <DefaultPropertiesDialog
        open={defaultsDialogOpen}
        onOpenChange={setDefaultsDialogOpen}
        userId={defaultsUser.id}
        userName={defaultsUser.name || defaultsUser.email}
      />
    )}
    </>
  );
}
