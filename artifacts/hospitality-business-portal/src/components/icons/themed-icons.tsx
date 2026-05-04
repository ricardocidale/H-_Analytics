import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  Warning,
  AlignLeft,
  Archive,
  ArrowDown,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowsDownUp,
  Bell,
  BookOpen,
  Buildings,
  Calculator,
  Check,
  CheckSquare,
  Cloud,
  CaretDoubleLeft,
  CaretDoubleRight,
  DownloadSimple,
  CheckCircle,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  CaretUp,
  Circle,
  Clock,
  Crop,
  Diamond,
  ArrowSquareOut,
  Flask,
  FolderOpen,
  Images,
  GitDiff,
  DotsSixVertical,
  Hourglass,
  Image,
  Info,
  Lightbulb,
  SpinnerGap,
  Lock,
  Envelope,
  ChatCircle,
  ChatSquare,
  Minus,
  Moon,
  DotsThree,
  DotsThreeVertical,
  SidebarSimple,
  ArrowLineRight,
  Paperclip,
  PencilSimple,
  Phone,
  PhoneDisconnect,
  Plus,
  ArrowCounterClockwise,
  Scales,
  MagnifyingGlass,
  PaperPlaneRight,
  HardDrives,
  ShareNetwork,
  Shield,
  Sparkle,
  NotePencil,
  SkipForward,
  Star,
  Sun,
  Trash,
  Trophy,
  ArrowClockwise,
  FileText,
  UploadSimple,
  X,
  XCircle,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
} from "@phosphor-icons/react";

export type { Icon as LucideIcon };

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const AlertTriangle = wd(Warning);
export const AlignLeft_ = wd(AlignLeft);
export { AlignLeft_ as AlignLeft };
export const Archive_ = wd(Archive);
export { Archive_ as Archive };
export const ArrowDown_ = wd(ArrowDown);
export { ArrowDown_ as ArrowDown };
export const ArrowDownRight_ = wd(ArrowDownRight);
export { ArrowDownRight_ as ArrowDownRight };
export const ArrowLeft_ = wd(ArrowLeft);
export { ArrowLeft_ as ArrowLeft };
export const ArrowRight_ = wd(ArrowRight);
export { ArrowRight_ as ArrowRight };
export const ArrowUp_ = wd(ArrowUp);
export { ArrowUp_ as ArrowUp };
export const ArrowUpDown = wd(ArrowsDownUp);
export const Bell_ = wd(Bell);
export { Bell_ as Bell };
export const BookOpen_ = wd(BookOpen);
export { BookOpen_ as BookOpen };
export const Building2 = wd(Buildings);
export const Calculator_ = wd(Calculator);
export { Calculator_ as Calculator };
export const Check_ = wd(Check);
export { Check_ as Check };
export const CheckSquare_ = wd(CheckSquare);
export { CheckSquare_ as CheckSquare };
export const Cloud_ = wd(Cloud);
export { Cloud_ as Cloud };
export const ChevronsLeft = wd(CaretDoubleLeft);
export const ChevronsRight = wd(CaretDoubleRight);
export const Download = wd(DownloadSimple);
export const CheckCircle_ = wd(CheckCircle);
export { CheckCircle_ as CheckCircle };
export const CheckCircle2 = wd(CheckCircle);
export const ChevronDown = wd(CaretDown);
export const ChevronLeft = wd(CaretLeft);
export const ChevronRight = wd(CaretRight);
export const ChevronsUpDown = wd(CaretUpDown);
export const ChevronUp = wd(CaretUp);
export const Circle_ = wd(Circle);
export { Circle_ as Circle };
export const Clock_ = wd(Clock);
export { Clock_ as Clock };
export const Crop_ = wd(Crop);
export { Crop_ as Crop };
export const Diamond_ = wd(Diamond);
export { Diamond_ as Diamond };
export const ExternalLink = wd(ArrowSquareOut);
export const FlaskConical = wd(Flask);
export const FolderInput = wd(FolderOpen);
export const GalleryHorizontal = wd(Images);
export const GalleryVerticalEnd = wd(Images);
export const GitCompare = wd(GitDiff);
export const GripVertical = wd(DotsSixVertical);
export const Hourglass_ = wd(Hourglass);
export { Hourglass_ as Hourglass };
export const ImageIcon = wd(Image);
export const ImagePlus = wd(Image);
export const Images_ = wd(Images);
export { Images_ as Images };
export const Info_ = wd(Info);
export { Info_ as Info };
export const Lightbulb_ = wd(Lightbulb);
export { Lightbulb_ as Lightbulb };
export const Loader2 = wd(SpinnerGap);
export const Lock_ = wd(Lock);
export { Lock_ as Lock };
export const Mail = wd(Envelope);
export const MessageCircle = wd(ChatCircle);
export const MessageSquare = wd(ChatSquare);
export const Minus_ = wd(Minus);
export { Minus_ as Minus };
export const Moon_ = wd(Moon);
export { Moon_ as Moon };
export const MoreHorizontal = wd(DotsThree);
export const MoreVertical = wd(DotsThreeVertical);
export const PanelLeft = wd(SidebarSimple);
export const PanelRightClose = wd(ArrowLineRight);
export const Paperclip_ = wd(Paperclip);
export { Paperclip_ as Paperclip };
export const Pencil = wd(PencilSimple);
export const Phone_ = wd(Phone);
export { Phone_ as Phone };
export const PhoneOff = wd(PhoneDisconnect);
export const Plus_ = wd(Plus);
export { Plus_ as Plus };
export const RotateCcw = wd(ArrowCounterClockwise);
export const Scale = wd(Scales);
export const Search = wd(MagnifyingGlass);
export const Send = wd(PaperPlaneRight);
export const Server = wd(HardDrives);
export const Share2 = wd(ShareNetwork);
export const Shield_ = wd(Shield);
export { Shield_ as Shield };
export const Sparkles = wd(Sparkle);
export const SquarePen = wd(NotePencil);
export const SkipForward_ = wd(SkipForward);
export { SkipForward_ as SkipForward };
export const Star_ = wd(Star);
export { Star_ as Star };
export const Sun_ = wd(Sun);
export { Sun_ as Sun };
export const Trash2 = wd(Trash);
export const TriangleAlert = wd(Warning);
export const Trophy_ = wd(Trophy);
export { Trophy_ as Trophy };
export const RefreshCw = wd(ArrowClockwise);
export const FileText_ = wd(FileText);
export { FileText_ as FileText };
export const Undo2 = wd(ArrowCounterClockwise);
export const Upload = wd(UploadSimple);
export const X_ = wd(X);
export { X_ as X };
export const XCircle_ = wd(XCircle);
export { XCircle_ as XCircle };
export const ZoomIn = wd(MagnifyingGlassPlus);
export const ZoomOut = wd(MagnifyingGlassMinus);

// Named aliases for compatibility
export const ArrowDownIcon = wd(ArrowDown);
export const ArrowUpIcon = wd(ArrowUp);
export const CheckIcon = wd(Check);
export const ChevronDownIcon = wd(CaretDown);
export const ChevronLeftIcon = wd(CaretLeft);
export const ChevronRightIcon = wd(CaretRight);
export const ChevronsLeftIcon = wd(CaretDoubleLeft);
export const ChevronsRightIcon = wd(CaretDoubleRight);
export const GripVerticalIcon = wd(DotsSixVertical);
export const Loader2Icon = wd(SpinnerGap);
export const LoaderIcon = wd(SpinnerGap);
export const MoreHorizontalIcon = wd(DotsThree);
export const MoreVerticalIcon = wd(DotsThreeVertical);
export const PhoneIcon = wd(Phone);
export const XIcon = wd(X);
