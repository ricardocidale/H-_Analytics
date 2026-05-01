import { DatabaseStorage } from "./storage/index";

export const storage = new DatabaseStorage();
export type { IStorage } from "./storage/index";
export type { ActivityLogFilters } from "./storage/activity";
