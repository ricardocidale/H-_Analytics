import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  Warning as PhWarning,
  AlignLeft as PhAlignLeft,
  Archive as PhArchive,
  ArrowDown as PhArrowDown,
  ArrowDownRight as PhArrowDownRight,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowUp as PhArrowUp,
  ArrowsDownUp as PhArrowsDownUp,
  Bell as PhBell,
  BookOpen as PhBookOpen,
  Buildings as PhBuildings,
  Calculator as PhCalculator,
  Check as PhCheck,
  CheckSquare as PhCheckSquare,
  Cloud as PhCloud,
  CaretDoubleLeft as PhCaretDoubleLeft,
  CaretDoubleRight as PhCaretDoubleRight,
  DownloadSimple as PhDownloadSimple,
  CheckCircle as PhCheckCircle,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUpDown as PhCaretUpDown,
  CaretUp as PhCaretUp,
  Circle as PhCircle,
  Clock as PhClock,
  Crop as PhCrop,
  Diamond as PhDiamond,
  ArrowSquareOut as PhArrowSquareOut,
  Flask as PhFlask,
  FolderOpen as PhFolderOpen,
  Images as PhImages,
  GitDiff as PhGitDiff,
  DotsSixVertical as PhDotsSixVertical,
  Hourglass as PhHourglass,
  Image as PhImage,
  Info as PhInfo,
  Lightbulb as PhLightbulb,
  SpinnerGap as PhSpinnerGap,
  Lock as PhLock,
  Envelope as PhEnvelope,
  ChatCircle as PhChatCircle,
  ChatSquare as PhChatSquare,
  Minus as PhMinus,
  Moon as PhMoon,
  DotsThree as PhDotsThree,
  DotsThreeVertical as PhDotsThreeVertical,
  SidebarSimple as PhSidebarSimple,
  ArrowLineRight as PhArrowLineRight,
  Paperclip as PhPaperclip,
  PencilSimple as PhPencilSimple,
  Phone as PhPhone,
  PhoneDisconnect as PhPhoneDisconnect,
  Plus as PhPlus,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  Scales as PhScales,
  MagnifyingGlass as PhMagnifyingGlass,
  PaperPlaneRight as PhPaperPlaneRight,
  HardDrives as PhHardDrives,
  ShareNetwork as PhShareNetwork,
  Shield as PhShield,
  Sparkle as PhSparkle,
  NotePencil as PhNotePencil,
  SkipForward as PhSkipForward,
  Star as PhStar,
  Sun as PhSun,
  Trash as PhTrash,
  Trophy as PhTrophy,
  ArrowClockwise as PhArrowClockwise,
  FileText as PhFileText,
  UploadSimple as PhUploadSimple,
  X as PhX,
  XCircle as PhXCircle,
  MagnifyingGlassPlus as PhMagnifyingGlassPlus,
  MagnifyingGlassMinus as PhMagnifyingGlassMinus,
} from "@phosphor-icons/react";

export type { Icon as LucideIcon };

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const AlertTriangle = wd(PhWarning);
export const AlignLeft = wd(PhAlignLeft);
export const Archive = wd(PhArchive);
export const ArrowDown = wd(PhArrowDown);
export const ArrowDownRight = wd(PhArrowDownRight);
export const ArrowLeft = wd(PhArrowLeft);
export const ArrowRight = wd(PhArrowRight);
export const ArrowUp = wd(PhArrowUp);
export const ArrowUpDown = wd(PhArrowsDownUp);
export const Bell = wd(PhBell);
export const BookOpen = wd(PhBookOpen);
export const Building2 = wd(PhBuildings);
export const Calculator = wd(PhCalculator);
export const Check = wd(PhCheck);
export const CheckSquare = wd(PhCheckSquare);
export const Cloud = wd(PhCloud);
export const ChevronsLeft = wd(PhCaretDoubleLeft);
export const ChevronsRight = wd(PhCaretDoubleRight);
export const Download = wd(PhDownloadSimple);
export const CheckCircle = wd(PhCheckCircle);
export const CheckCircle2 = wd(PhCheckCircle);
export const ChevronDown = wd(PhCaretDown);
export const ChevronLeft = wd(PhCaretLeft);
export const ChevronRight = wd(PhCaretRight);
export const ChevronsUpDown = wd(PhCaretUpDown);
export const ChevronUp = wd(PhCaretUp);
export const Circle = wd(PhCircle);
export const Clock = wd(PhClock);
export const Crop = wd(PhCrop);
export const Diamond = wd(PhDiamond);
export const ExternalLink = wd(PhArrowSquareOut);
export const FlaskConical = wd(PhFlask);
export const FolderInput = wd(PhFolderOpen);
export const GalleryHorizontal = wd(PhImages);
export const GalleryVerticalEnd = wd(PhImages);
export const GitCompare = wd(PhGitDiff);
export const GripVertical = wd(PhDotsSixVertical);
export const Hourglass = wd(PhHourglass);
export const ImageIcon = wd(PhImage);
export const ImagePlus = wd(PhImage);
export const Images = wd(PhImages);
export const Info = wd(PhInfo);
export const Lightbulb = wd(PhLightbulb);
export const Loader2 = wd(PhSpinnerGap);
export const Lock = wd(PhLock);
export const Mail = wd(PhEnvelope);
export const MessageCircle = wd(PhChatCircle);
export const MessageSquare = wd(PhChatSquare);
export const Minus = wd(PhMinus);
export const Moon = wd(PhMoon);
export const MoreHorizontal = wd(PhDotsThree);
export const MoreVertical = wd(PhDotsThreeVertical);
export const PanelLeft = wd(PhSidebarSimple);
export const PanelRightClose = wd(PhArrowLineRight);
export const Paperclip = wd(PhPaperclip);
export const Pencil = wd(PhPencilSimple);
export const Phone = wd(PhPhone);
export const PhoneOff = wd(PhPhoneDisconnect);
export const Plus = wd(PhPlus);
export const RotateCcw = wd(PhArrowCounterClockwise);
export const Scale = wd(PhScales);
export const Search = wd(PhMagnifyingGlass);
export const Send = wd(PhPaperPlaneRight);
export const Server = wd(PhHardDrives);
export const Share2 = wd(PhShareNetwork);
export const Shield = wd(PhShield);
export const Sparkles = wd(PhSparkle);
export const SquarePen = wd(PhNotePencil);
export const SkipForward = wd(PhSkipForward);
export const Star = wd(PhStar);
export const Sun = wd(PhSun);
export const Trash2 = wd(PhTrash);
export const TriangleAlert = wd(PhWarning);
export const Trophy = wd(PhTrophy);
export const RefreshCw = wd(PhArrowClockwise);
export const FileText = wd(PhFileText);
export const Undo2 = wd(PhArrowCounterClockwise);
export const Upload = wd(PhUploadSimple);
export const X = wd(PhX);
export const XCircle = wd(PhXCircle);
export const ZoomIn = wd(PhMagnifyingGlassPlus);
export const ZoomOut = wd(PhMagnifyingGlassMinus);

// Named aliases for compatibility
export const ArrowDownIcon = ArrowDown;
export const ArrowUpIcon = ArrowUp;
export const CheckIcon = Check;
export const ChevronDownIcon = ChevronDown;
export const ChevronLeftIcon = ChevronLeft;
export const ChevronRightIcon = ChevronRight;
export const ChevronsLeftIcon = ChevronsLeft;
export const ChevronsRightIcon = ChevronsRight;
export const GripVerticalIcon = GripVertical;
export const Loader2Icon = Loader2;
export const LoaderIcon = Loader2;
export const MoreHorizontalIcon = MoreHorizontal;
export const MoreVerticalIcon = MoreVertical;
export const PhoneIcon = Phone;
export const XIcon = X;
