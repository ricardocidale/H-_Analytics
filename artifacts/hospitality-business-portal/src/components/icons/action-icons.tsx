import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  Plus, PlusCircle, Trash, PencilSimple, Copy, FloppyDisk, UploadSimple,
  DownloadSimple, Export, ArrowCounterClockwise, ArrowClockwise, Eye, EyeSlash,
  Key, UserPlus, Envelope, Users, Palette, Swatches, Image, ShareNetwork,
  ArrowsOut, ArrowsIn, Crop, ArrowsLeftRight, ArrowUpRight, GitDiff,
} from "@phosphor-icons/react";

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const IconPlus = wd(Plus);
export const IconPlusCircle = wd(PlusCircle);
export const IconTrash = wd(Trash);
export const IconPencil = wd(PencilSimple);
export const IconCopy = wd(Copy);
export const IconSave = wd(FloppyDisk);
export const IconUpload = wd(UploadSimple);
export const IconDownload = wd(DownloadSimple);
export const IconExport = wd(Export);
export const IconRefresh = wd(ArrowCounterClockwise);
export const IconRefreshCw = wd(ArrowClockwise);
export const IconEye = wd(Eye);
export const IconEyeOff = wd(EyeSlash);
export const IconKey = wd(Key);
export const IconUserPlus = wd(UserPlus);
export const IconMail = wd(Envelope);
export const IconGroupUsers = wd(Users);
export const IconPalette = wd(Palette);
export const IconSwatchBook = wd(Swatches);
export const IconImage = wd(Image);
export const IconImageIcon = wd(Image);
export const IconShare = wd(ShareNetwork);
export const IconMaximize2 = wd(ArrowsOut);
export const IconMinimize2 = wd(ArrowsIn);
export const IconCrop = wd(Crop);
export const IconArrowRightLeft = wd(ArrowsLeftRight);
export const IconArrowUpRight = wd(ArrowUpRight);
export const IconGitCompareArrows = wd(GitDiff);
