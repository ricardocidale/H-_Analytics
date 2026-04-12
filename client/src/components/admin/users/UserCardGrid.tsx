import React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowUp, ArrowDown, ArrowUpDown } from "@/components/icons/themed-icons";
import { IconPeople, IconTrash, IconKey, IconPencil, IconShield, IconUserCog, IconBuilding2 } from "@/components/icons";
import defaultLogo from "@/assets/logo.png";
import type { User } from "../types";
import { UserRole } from "@shared/constants";
import type { SortField, SortDir } from "./types";

interface UserCardGridProps {
  sortedUsers: User[];
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  companyNameMap: Record<number, string>;
  companyLogoMap: Record<number, string>;
  generalLogoUrl: string | null;
  companiesList: { id: number; name: string }[] | undefined;
  onEditUser: (user: User) => void;
  onPasswordUser: (user: User) => void;
  onDeleteUser: (id: number) => void;
  onToggleScenarios?: (userId: number, value: boolean) => void;
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
}

export default function UserCardGrid({
  sortedUsers,
  sortField,
  sortDir,
  toggleSort,
  companyNameMap,
  companyLogoMap,
  generalLogoUrl,
  companiesList,
  onEditUser,
  onPasswordUser,
  onDeleteUser,
  onToggleScenarios,
}: UserCardGridProps) {
  return (
    <>
      <div className="flex items-center gap-4 mb-4 px-1">
        <Button variant="ghost" className="flex items-center gap-1.5 text-sm text-muted-foreground font-display h-auto px-1 py-0.5 hover:text-foreground" onClick={() => toggleSort("name")} data-testid="sort-user-name">
          <IconPeople className="w-4 h-4" />User <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
        </Button>
        <Button variant="ghost" className="flex items-center gap-1.5 text-sm text-muted-foreground font-display h-auto px-1 py-0.5 hover:text-foreground" onClick={() => toggleSort("role")} data-testid="sort-user-role">
          <IconShield className="w-4 h-4" />Role <SortIcon field="role" sortField={sortField} sortDir={sortDir} />
        </Button>
        <Button variant="ghost" className="flex items-center gap-1.5 text-sm text-muted-foreground font-display h-auto px-1 py-0.5 hover:text-foreground" onClick={() => toggleSort("company")} data-testid="sort-user-company">
          <IconBuilding2 className="w-4 h-4" />Company <SortIcon field="company" sortField={sortField} sortDir={sortDir} />
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sortedUsers.map((user, idx, arr) => {
          const currentCompany = user.companyId ? companyNameMap[user.companyId] || "Unknown Company" : "No Company";
          const prevCompany = idx > 0
            ? (arr[idx - 1].companyId ? companyNameMap[arr[idx - 1].companyId!] || "Unknown Company" : "No Company")
            : null;
          const sectionLabel = sortField === "company" ? currentCompany : null;
          const prevLabel = sortField === "company" ? prevCompany : null;
          const showHeader = sectionLabel !== null && sectionLabel !== prevLabel;
          return (<React.Fragment key={user.id}>
            {showHeader && (
              <div key={`section-header-${sectionLabel}-${idx}`} className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 py-1.5 px-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[11px] font-medium text-accent uppercase tracking-wider whitespace-nowrap">{sectionLabel}</span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              </div>
            )}
            <div
              className="rounded-lg border border-border bg-muted/50 shadow-sm p-4 transition-colors hover:bg-muted/70"
              data-testid={`row-user-${user.id}`}
            >
              <div className="flex items-start gap-3">
                <img
                  src={
                    (user.companyId && companyLogoMap[user.companyId])
                      ? companyLogoMap[user.companyId]
                      : generalLogoUrl ?? defaultLogo
                  }
                  alt={user.companyId && companiesList ? (companiesList.find(c => c.id === user.companyId)?.name ?? "Company") : "General"}
                  className="w-8 h-8 rounded-md border border-border/60 bg-background object-contain p-0.5 flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = defaultLogo; }}
                  data-testid={`user-company-logo-${user.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-medium truncate">{user.name || user.email}</div>
                  {user.name && <div className="text-xs text-muted-foreground truncate">{user.email}</div>}
                  {user.title && <div className="text-[11px] text-muted-foreground/70 truncate">{user.title}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 p-0"
                    onClick={() => onEditUser(user)}
                    data-testid={`button-edit-user-${user.id}`}
                    aria-label={`Edit ${user.name || user.email}`}>
                    <IconPencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 p-0"
                    onClick={() => onPasswordUser(user)}
                    data-testid={`button-password-user-${user.id}`}
                    aria-label={`Reset password for ${user.name || user.email}`}>
                    <IconKey className="w-4 h-4" />
                  </Button>
                  {user.role !== UserRole.ADMIN && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive/80 hover:text-destructive/60 hover:bg-destructive/10 h-8 w-8 p-0"
                          data-testid={`button-delete-user-${user.id}`}
                          aria-label={`Delete ${user.name || user.email}`}>
                          <IconTrash className="w-4 h-4" />
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
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40">
                <span className={`px-2 py-0.5 rounded text-xs font-medium tracking-wide
                  ${user.role === UserRole.ADMIN
                    ? 'bg-primary/15 text-primary'
                    : user.role === UserRole.CHECKER
                    ? 'bg-accent/15 text-accent'
                    : 'bg-muted text-muted-foreground'}`}>
                  {user.role}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Scenarios</span>
                  <Switch
                    checked={user.canManageScenarios ?? true}
                    onCheckedChange={(checked) => onToggleScenarios?.(user.id, checked)}
                    data-testid={`switch-scenarios-${user.id}`}
                    className="scale-75"
                  />
                </div>
              </div>
            </div>
          </React.Fragment>);
        })}
      </div>
    </>
  );
}
