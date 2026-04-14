import React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowUp, ArrowDown, ArrowUpDown } from "@/components/icons/themed-icons";
import { IconPeople, IconTrash, IconKey, IconPencil, IconBuilding2, IconHome } from "@/components/icons";
import type { User } from "../types";
import { UserRole, isAdminRole } from "@shared/constants";
import type { SortField, SortDir } from "./types";

interface UserCardGridProps {
  sortedUsers: User[];
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  currentUserRole?: string;
  onEditUser: (user: User) => void;
  onPasswordUser: (user: User) => void;
  onDeleteUser: (id: number) => void;
  onToggleScenarios?: (userId: number, value: boolean) => void;
  onManageDefaults?: (user: User) => void;
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
}

function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === UserRole.SUPER_ADMIN) return "default";
  if (role === UserRole.ADMIN) return "default";
  if (role === UserRole.CHECKER) return "secondary";
  return "outline";
}

function roleAvatarColors(role: string): string {
  if (role === UserRole.SUPER_ADMIN) return "bg-amber-100 text-amber-800 border-amber-300";
  if (role === UserRole.ADMIN) return "bg-sky-100 text-sky-800 border-sky-300";
  if (role === UserRole.CHECKER) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (role === UserRole.INVESTOR) return "bg-violet-100 text-violet-800 border-violet-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function ActionButton({ icon, label, onClick, testId, variant = "ghost" }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  variant?: "ghost" | "destructive-ghost";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={`h-7 w-7 ${variant === "destructive-ghost" ? "text-destructive/70 hover:text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:text-foreground"}`}
          onClick={onClick}
          data-testid={testId}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function UserCardGrid({
  sortedUsers,
  sortField,
  sortDir,
  toggleSort,
  currentUserRole,
  onEditUser,
  onPasswordUser,
  onDeleteUser,
  onToggleScenarios,
  onManageDefaults,
}: UserCardGridProps) {
  const canModifyUser = (user: User) => {
    if (user.role === UserRole.SUPER_ADMIN && currentUserRole !== UserRole.SUPER_ADMIN) return false;
    return true;
  };
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-4 mb-4 px-1">
        <Button variant="ghost" className="flex items-center gap-1.5 text-sm text-muted-foreground font-display h-auto px-1 py-0.5 hover:text-foreground" onClick={() => toggleSort("name")} data-testid="sort-user-name">
          <IconPeople className="w-4 h-4" />User <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
        </Button>
        <Button variant="ghost" className="flex items-center gap-1.5 text-sm text-muted-foreground font-display h-auto px-1 py-0.5 hover:text-foreground" onClick={() => toggleSort("role")} data-testid="sort-user-role">
          <IconBuilding2 className="w-4 h-4" />Role <SortIcon field="role" sortField={sortField} sortDir={sortDir} />
        </Button>
        <Button variant="ghost" className="flex items-center gap-1.5 text-sm text-muted-foreground font-display h-auto px-1 py-0.5 hover:text-foreground" onClick={() => toggleSort("company")} data-testid="sort-user-company">
          <IconBuilding2 className="w-4 h-4" />Company <SortIcon field="company" sortField={sortField} sortDir={sortDir} />
        </Button>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {sortedUsers.map((user, idx, arr) => {
          const currentCompany = user.company || "No Company";
          const prevCompany = idx > 0 ? (arr[idx - 1].company || "No Company") : null;
          const sectionLabel = sortField === "company" ? currentCompany : null;
          const prevLabel = sortField === "company" ? prevCompany : null;
          const showHeader = sectionLabel !== null && sectionLabel !== prevLabel;
          const initials = getInitials(user.name, user.email);
          const companyName = user.company || null;

          return (
            <React.Fragment key={user.id}>
              {showHeader && (
                <div className="py-1.5 px-4" style={{ gridColumn: "1 / -1" }}>
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[11px] font-medium text-accent uppercase tracking-wider whitespace-nowrap">{sectionLabel}</span>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                </div>
              )}

              <div
                className="group rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                data-testid={`row-user-${user.id}`}
              >
                <div className="p-4 flex items-start gap-3">
                  <Avatar className={`h-10 w-10 shrink-0 border ${roleAvatarColors(user.role)}`}>
                    <AvatarFallback className={`text-sm font-semibold ${roleAvatarColors(user.role)}`}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-semibold text-sm leading-tight" data-testid={`text-username-${user.id}`}>
                      {user.name || user.email}
                    </div>
                    {user.name && (
                      <div className="text-xs text-muted-foreground mt-0.5" data-testid={`text-email-${user.id}`}>
                        {user.email}
                      </div>
                    )}
                    {user.title && (
                      <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {user.title}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={roleBadgeVariant(user.role)} className="text-[11px] px-2 py-0"
                      data-testid={`badge-role-${user.id}`}>
                      {user.role}
                    </Badge>
                    {companyName && (
                      <span className="text-[11px] text-muted-foreground">{companyName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Scenarios</span>
                    <Switch
                      checked={user.canManageScenarios ?? true}
                      onCheckedChange={(checked) => onToggleScenarios?.(user.id, checked)}
                      data-testid={`switch-scenarios-${user.id}`}
                      className="scale-75"
                    />
                  </div>
                </div>

                {canModifyUser(user) && (
                  <div className="border-t border-border/50 px-3 py-1.5 flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                    <ActionButton
                      icon={<IconPencil className="w-3.5 h-3.5" />}
                      label="Edit"
                      onClick={() => onEditUser(user)}
                      testId={`button-edit-user-${user.id}`}
                    />
                    <ActionButton
                      icon={<IconKey className="w-3.5 h-3.5" />}
                      label="Reset password"
                      onClick={() => onPasswordUser(user)}
                      testId={`button-password-user-${user.id}`}
                    />
                    {onManageDefaults && (
                      <ActionButton
                        icon={<IconHome className="w-3.5 h-3.5" />}
                        label="Default properties"
                        onClick={() => onManageDefaults(user)}
                        testId={`button-defaults-user-${user.id}`}
                      />
                    )}
                    {!isAdminRole(user.role) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                            data-testid={`button-delete-user-${user.id}`}
                            aria-label={`Delete ${user.name || user.email}`}
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{user.email}"? This will permanently remove the user and all their data, including any scenarios they own and all associated access grants. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDeleteUser(user.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
