import type { User } from "../types";
import { UserRole } from "@shared/constants";

export type Company = { id: number; name: string; logoId: number | null; isActive: boolean };
export type SortField = "name" | "role" | "company";
export type SortDir = "asc" | "desc";

export type NewUserForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyId: number | null;
  title: string;
  role: string;
};

export type EditUserForm = {
  email: string;
  firstName: string;
  lastName: string;
  companyId: number | null;
  title: string;
  role: string;
  password: string;
  canManageScenarios: boolean;
};

export type InlineCompanyForm = {
  name: string;
  description: string;
  logoId: number | null;
  themeId: number | null;
};

export const defaultNewUser: NewUserForm = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  companyId: null,
  title: "",
  role: UserRole.USER,
};

export const defaultEditUser: EditUserForm = {
  email: "",
  firstName: "",
  lastName: "",
  companyId: null,
  title: "",
  role: UserRole.USER,
  password: "",
  canManageScenarios: true,
};

export const defaultInlineCompanyForm: InlineCompanyForm = {
  name: "",
  description: "",
  logoId: null,
  themeId: null,
};
