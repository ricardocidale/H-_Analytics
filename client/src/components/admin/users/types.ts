import type { User } from "../types";
import { UserRole } from "@shared/constants";

export type SortField = "name" | "role" | "company";
export type SortDir = "asc" | "desc";

export type NewUserForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  role: string;
};

export type EditUserForm = {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  role: string;
  password: string;
  canManageScenarios: boolean;
};

export const defaultNewUser: NewUserForm = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  company: "",
  title: "",
  role: UserRole.USER,
};

export const defaultEditUser: EditUserForm = {
  email: "",
  firstName: "",
  lastName: "",
  company: "",
  title: "",
  role: UserRole.USER,
  password: "",
  canManageScenarios: true,
};
