import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  SquaresFour, Buildings, MagnifyingGlass, MapPin, House, Building, Bed,
  MapTrifold, Mountains, Compass, Globe, NavigationArrow, SignIn, SignOut,
  List, SidebarSimple, Package, Layout, Rows, Columns, ListBullets,
  DotsThreeVertical, PresentationChart, Calendar, BookOpen, BookOpenText,
  Books, Tray, ArrowBendUpRight, ClockCounterClockwise, FolderNotch,
} from "@phosphor-icons/react";

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const IconDashboard = wd(SquaresFour);
export const IconProperties = wd(Buildings);
export const IconPropertyFinder = wd(MagnifyingGlass);
export const IconMapPin = wd(MapPin);
export const IconHome = wd(House);
export const IconHotel = wd(Building);
export const IconBed = wd(Bed);
export const IconBuilding = wd(Building);
export const IconBuilding2 = wd(Buildings);
export const IconMap = wd(MapTrifold);
export const IconMountain = wd(Mountains);
export const IconCompass = wd(Compass);
export const IconGlobe = wd(Globe);
export const IconNavigation = wd(NavigationArrow);
export const IconLogIn = wd(SignIn);
export const IconLogOut = wd(SignOut);
export const IconMenu = wd(List);
export const IconPanelLeft = wd(SidebarSimple);
export const IconPackage = wd(Package);
export const IconLayoutGrid = wd(SquaresFour);
export const IconLayoutDashboard = wd(Layout);
export const IconLayoutTemplate = wd(Rows);
export const IconColumns = wd(Columns);
export const IconList = wd(ListBullets);
export const IconMoreVertical = wd(DotsThreeVertical);
export const IconPresentation = wd(PresentationChart);
export const IconCalendar = wd(Calendar);
export const IconBookOpen = wd(BookOpen);
export const IconBookOpenCheck = wd(BookOpenText);
export const IconLibrary = wd(Books);
export const IconInbox = wd(Tray);
export const IconForward = wd(ArrowBendUpRight);
export const IconHistory = wd(ClockCounterClockwise);
export const IconScenarios = wd(FolderNotch);
