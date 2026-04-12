/**
 * UsersTab.tsx — User management panel for platform administrators.
 *
 * Provides full CRUD for user accounts:
 *   • List all registered users with search/filter
 *   • Create new users with username, password, and role assignment
 *   • Edit user details (name, email, role)
 *   • Reset passwords (generates a temporary password)
 *   • Delete users (with confirmation dialog)
 *   • Assign users to a company
 *
 * Roles:
 *   • "admin"   – full platform access including this admin panel
 *   • "user"    – standard access to portfolio and financial views
 *   • "checker" – read-only access for financial verification/audit
 *
 * User data is fetched via TanStack Query from GET /api/admin/users
 * and mutations go to POST/PATCH/DELETE /api/admin/users.
 */
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconKey, IconUserPlus, IconSend } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useAdminLogos, useAdminUsers, useAdminCompanies, useAdminThemes, useAdminAssetDescriptions } from "./hooks";
import { UserRole } from "@shared/constants";
import type { User } from "./types";
import type { SortField, SortDir } from "./users/types";
import { defaultNewUser, defaultEditUser, defaultInlineCompanyForm } from "./users/types";
import UserCardGrid from "./users/UserCardGrid";
import CreateUserDialog from "./users/CreateUserDialog";
import EditUserDialog from "./users/EditUserDialog";
import PasswordDialog from "./users/PasswordDialog";
import ResetAllDialog from "./users/ResetAllDialog";
import { InlineCompanyDialog } from "./users/InlineCreateDialogs";
import InviteUsersDialog from "./users/InviteUsersDialog";

export default function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const [inlineCompanyOpen, setInlineCompanyOpen] = useState(false);
  const [inlineCompanyForm, setInlineCompanyForm] = useState(defaultInlineCompanyForm);
  const [inlineCompanyTarget, setInlineCompanyTarget] = useState<"new" | "edit">("new");
  const [sortField, setSortField] = useState<SortField>("company");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [resetAllPassword, setResetAllPassword] = useState("");
  const [resetAllConfirm, setResetAllConfirm] = useState("");
  const [resetAllDialogOpen, setResetAllDialogOpen] = useState(false);
  const [showResetAllPassword, setShowResetAllPassword] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users, isLoading: usersLoading } = useAdminUsers();
  const { data: adminLogos } = useAdminLogos();
  const { data: companiesList } = useAdminCompanies();
  const { data: allThemes } = useAdminThemes();
  const { data: assetDescriptions } = useAdminAssetDescriptions();

  const companyLogoMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (!companiesList || !adminLogos) return map;
    const logoUrlMap: Record<number, string> = {};
    adminLogos.forEach(l => { logoUrlMap[l.id] = l.url; });
    companiesList.forEach(c => {
      if (c.logoId && logoUrlMap[c.logoId]) {
        map[c.id] = logoUrlMap[c.logoId];
      }
    });
    return map;
  }, [companiesList, adminLogos]);

  const companyNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    companiesList?.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [companiesList]);

  const generalLogoUrl = useMemo(() => {
    if (!companiesList || !adminLogos) return null;
    const generalCompany = companiesList.find(c => c.name === "General");
    if (!generalCompany?.logoId) return null;
    const logo = adminLogos.find(l => l.id === generalCompany.logoId);
    return logo?.url ?? null;
  }, [companiesList, adminLogos]);

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
          const ca = (a.companyId ? companyNameMap[a.companyId] : "") || "";
          const cb = (b.companyId ? companyNameMap[b.companyId] : "") || "";
          cmp = ca.localeCompare(cb);
          if (cmp === 0) cmp = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, sortField, sortDir, companyNameMap]);

  const inlineCreateCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; description?: string | null; logoId?: number | null; themeId?: number | null }) => {
      const res = await fetch("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!res.ok) throw new Error("Failed to create company");
      return res.json();
    },
    onSuccess: (newCompany) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "companies"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setInlineCompanyOpen(false);
      setInlineCompanyForm(defaultInlineCompanyForm);
      if (inlineCompanyTarget === "new") {
        setNewUser(prev => ({ ...prev, companyId: newCompany.id }));
      } else {
        setEditUser(prev => ({ ...prev, companyId: newCompany.id }));
      }
      toast({ title: "Company Created", description: `"${newCompany.name}" has been created and selected.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { email: string; password?: string; firstName?: string; lastName?: string; companyId?: number | null; title?: string; role?: string }) => {
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
    mutationFn: async ({ id, data }: { id: number; data: { email?: string; firstName?: string; lastName?: string; companyId?: number | null; title?: string; role?: string; canManageScenarios?: boolean } }) => {
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
      companyId: user.companyId ?? null,
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
    const data: { email?: string; firstName?: string; lastName?: string; companyId?: number | null; title?: string; role?: string; canManageScenarios?: boolean } = {
      firstName: editUser.firstName,
      lastName: editUser.lastName,
      companyId: editUser.companyId,
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
            companyNameMap={companyNameMap}
            companyLogoMap={companyLogoMap}
            generalLogoUrl={generalLogoUrl}
            companiesList={companiesList}
            onEditUser={handleEditUser}
            onPasswordUser={handlePasswordUser}
            onDeleteUser={(id) => deleteMutation.mutate(id)}
            onToggleScenarios={(userId, value) => {
              editMutation.mutate({ id: userId, data: { canManageScenarios: value } });
            }}
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
      companiesList={companiesList}
      companyLogoMap={companyLogoMap}
      isPending={createMutation.isPending}
      onSubmit={handleCreateSubmit}
      onAddCompany={() => { setInlineCompanyTarget("new"); setInlineCompanyForm({ ...defaultInlineCompanyForm }); setInlineCompanyOpen(true); }}
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
      companiesList={companiesList}
      companyLogoMap={companyLogoMap}
      isPending={editMutation.isPending}
      onSubmit={handleEditSubmit}
      onAddCompany={() => { setInlineCompanyTarget("edit"); setInlineCompanyForm({ ...defaultInlineCompanyForm }); setInlineCompanyOpen(true); }}
    />

    <InlineCompanyDialog
      open={inlineCompanyOpen}
      onOpenChange={setInlineCompanyOpen}
      form={inlineCompanyForm}
      setForm={setInlineCompanyForm}
      adminLogos={adminLogos}
      allThemes={allThemes}
      isPending={inlineCreateCompanyMutation.isPending}
      onSubmit={() => inlineCreateCompanyMutation.mutate({ ...inlineCompanyForm, type: "spv", description: inlineCompanyForm.description || null })}
    />

    <InviteUsersDialog
      open={inviteOpen}
      onOpenChange={setInviteOpen}
      companiesList={companiesList}
    />
    </>
  );
}
