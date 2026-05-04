import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  Gear, GearSix, Faders, SlidersHorizontal, Wrench, Shield, ShieldWarning,
  ShieldCheck, WarningCircle, Warning, CheckCircle, Info, Question, XCircle,
  Bell, Clock, Timer, SealCheck, Target, Star, Tag, Heart, BookmarkSimple,
  Hash, ToggleLeft, ThumbsUp, ChatText, User, Article, Check, X,
} from "@phosphor-icons/react";

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const IconSettings = wd(Gear);
export const IconSettingsGear = wd(GearSix);
export const IconSettings2 = wd(Faders);
export const IconSliders = wd(SlidersHorizontal);
export const IconWrench = wd(Wrench);
export const IconShield = wd(Shield);
export const IconShieldAlert = wd(ShieldWarning);
export const IconShieldCheck = wd(ShieldCheck);
export const IconAlertCircle = wd(WarningCircle);
export const IconAlertTriangle = wd(Warning);
export const IconCheckCircle = wd(CheckCircle);
export const IconCheckCircle2 = wd(CheckCircle);
export const IconInfo = wd(Info);
export const IconHelpCircle = wd(Question);
export const IconXCircle = wd(XCircle);
export const IconBell = wd(Bell);
export const IconClock = wd(Clock);
export const IconTimer = wd(Timer);
export const IconVerify = wd(SealCheck);
export const IconTarget = wd(Target);
export const IconStar = wd(Star);
export const IconTag = wd(Tag);
export const IconHeart = wd(Heart);
export const IconBookmark = wd(BookmarkSimple);
export const IconHash = wd(Hash);
export const IconToggleLeft = wd(ToggleLeft);
export const IconThumbsUp = wd(ThumbsUp);
export const IconHelp = wd(ChatText);
export const IconProfile = wd(User);
export const IconExecutive = wd(Article);
export const IconCheck = wd(Check);
export const IconX = wd(X);
