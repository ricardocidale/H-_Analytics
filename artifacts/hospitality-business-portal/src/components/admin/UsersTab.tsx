import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconUserPlus, IconSend, IconHelpCircle } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { useAdminUsers, adminFetch } from "./hooks";
import { type AdminScenario } from "./scenarios/ScenarioCard";
import { useAuth } from "@/lib/auth";
import { UserRole } from "@shared/constants";
import type { User } from "./types";
import type { SortField, SortDir } from "./users/types";
import { defaultNewUser, defaultEditUser } from "./users/types";
import UserCardGrid from "./users/UserCardGrid";
import CreateUserDialog from "./users/CreateUserDialog";
import EditUserDialog from "./users/EditUserDialog";
import PasswordDialog from "./users/PasswordDialog";
import InviteUsersDialog from "./users/InviteUsersDialog";
import DefaultPropertiesDialog from "./users/DefaultPropertiesDialog";

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <span className="text-xs text-muted-foreground/60 tabular-nums">
        {count} {count === 1 ? "user" : "users"}
      </span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

export default function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isSuperAdmin } = useAuth();

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [defaultsDialogOpen, setDefaultsDialogOpen] = useState(false);
  const [defaultsUser, setDefaultsUser] = useState<User | null>(null);

  const { data: users, isLoading: usersLoading } = useAdminUsers();

  const { data: scenarios } = useQuery<AdminScenario[]>({
    queryKey: ["admin", "scenarios"],
    queryFn: adminFetch<AdminScenario[]>("/api/admin/scenarios", "Failed to fetch scenarios"),
  });

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

  const mainUsers = useMemo(
    () => sortedUsers.filter(u => u.role === UserRole.USER),
    [sortedUsers],
  );

  const adminUsers = useMemo(
    () => sortedUsers.filter(u => u.role === UserRole.ADMIN || u.role === UserRole.SUPER_ADMIN),
    [sortedUsers],
  );

  const createMutation = useMutation({
    mutationFn: async (data: { email: string; password?: string; firstName?: string; lastName?: string; company?: string; title?: string; role?: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data, {
        fallbackMessage: "Failed to create user",
      });
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
      await apiRequest("DELETE", `/api/admin/users/${id}`, undefined, {
        fallbackMessage: "Failed to delete user",
      });
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
      await apiRequest("PATCH", `/api/admin/users/${id}/password`, { password }, {
        fallbackMessage: "Failed to update password",
      });
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

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { email?: string; firstName?: string; lastName?: string; company?: string; title?: string; role?: string; canManageScenarios?: boolean } }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data, {
        fallbackMessage: "Failed to update user",
      });
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

  const assignScenarioMutation = useMutation({
    mutationFn: async ({ id, scenarioId }: { id: number; scenarioId: number | null }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/assigned-scenario`, { scenarioId }, {
        fallbackMessage: "Failed to assign scenario",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "Scenario Assigned", description: "Default scenario updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEditUser = (targetUser: User) => {
    setSelectedUser(targetUser);
    setOriginalEmail(targetUser.email);
    setEditUser({
      email: targetUser.email,
      firstName: targetUser.firstName || "",
      lastName: targetUser.lastName || "",
      company: targetUser.company || "",
      title: targetUser.title || "",
      role: targetUser.role || UserRole.USER,
      password: "",
      canManageScenarios: targetUser.canManageScenarios ?? true,
      assignedScenarioId: targetUser.assignedScenarioId ?? null,
    });
    setShowEditPassword(false);
    setEditDialogOpen(true);
  };

  const handlePasswordUser = (targetUser: User) => {
    setSelectedUser(targetUser);
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
    if (editUser.assignedScenarioId !== (selectedUser.assignedScenarioId ?? null)) {
      assignScenarioMutation.mutate({ id: selectedUser.id, scenarioId: editUser.assignedScenarioId });
    }
  };

  const sharedGridProps = {
    sortField,
    sortDir,
    toggleSort,
    currentUserRole: user?.role,
    onEditUser: handleEditUser,
    onPasswordUser: handlePasswordUser,
    onDeleteUser: (id: number) => deleteMutation.mutate(id),
    onToggleScenarios: (userId: number, value: boolean) => {
      editMutation.mutate({ id: userId, data: { canManageScenarios: value } });
    },
    onManageDefaults: (targetUser: User) => { setDefaultsUser(targetUser); setDefaultsDialogOpen(true); },
  };

  return (
    <TooltipProvider delayDuration={300}>
    <>
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-foreground">User Management</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconHelpCircle className="w-4 h-4 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs max-w-[280px]">
                  Only users listed here can log in. There is no public sign-up — every user must be added or invited by an admin. <strong>Main</strong> users have standard access. <strong>Admin</strong> users manage the platform. Only super admins can change roles.
                </TooltipContent>
              </Tooltip>
            </div>
            <CardDescription className="label-text">
              {users?.length ?? 0} registered users
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={() => setInviteOpen(true)} data-testid="button-invite-users">
                  <IconSend className="w-4 h-4" />
                  Invite Users
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                Send email invitations to one or more people. The system creates their account with a temporary password and emails them login instructions.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="default" onClick={() => setDialogOpen(true)} data-testid="button-add-user">
                  <IconUserPlus className="w-4 h-4" />
                  Add User
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                Manually create a user account. You set their email, password, and role. Share the credentials with them directly.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        {usersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent-pop" />
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <SectionHeader label="Main" count={mainUsers.length} />
              {mainUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No standard users yet. Use Add User or Invite Users to get started.
                </p>
              ) : (
                <UserCardGrid
                  {...sharedGridProps}
                  sortedUsers={mainUsers}
                  showSortControls
                />
              )}
            </div>

            <div>
              <SectionHeader label="Admin" count={adminUsers.length} />
              {adminUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No admin users.
                  {isSuperAdmin && " Use the edit button on a Main user to promote them."}
                </p>
              ) : (
                <UserCardGrid
                  {...sharedGridProps}
                  sortedUsers={adminUsers}
                  showSortControls={false}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

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
      scenarios={scenarios ?? []}
      currentUserRole={user?.role}
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
    </TooltipProvider>
  );
}
