import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  FileText, FileArrowDown, Table, Files, ChartBar, File, FileCode,
  FileArrowUp, FolderOpen, Folder, ClipboardText, Database, Cpu,
  HardDrives, HardDrive, Monitor, Note, Keyboard,
} from "@phosphor-icons/react";

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const IconFileText = wd(FileText);
export const IconFileDown = wd(FileArrowDown);
export const IconFileSpreadsheet = wd(Table);
export const IconFileStack = wd(Files);
export const IconFileBarChart = wd(ChartBar);
export const IconFileCheck = wd(FileText);
export const IconFile = wd(File);
export const IconFileCode = wd(FileCode);
export const IconFileUp = wd(FileArrowUp);
export const IconFolderOpen = wd(FolderOpen);
export const IconFolder = wd(Folder);
export const IconClipboardCheck = wd(ClipboardText);
export const IconClipboardList = wd(ClipboardText);
export const IconDatabase = wd(Database);
export const IconCpu = wd(Cpu);
export const IconServer = wd(HardDrives);
export const IconHardDrive = wd(HardDrive);
export const IconMonitor = wd(Monitor);
export const IconStickyNote = wd(Note);
export const IconKeyboard = wd(Keyboard);
