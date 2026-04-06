import { forwardRef, type SVGAttributes } from "react";
import { useIconSet } from "./IconSetContext";

import {
  AlertTriangle as LAlertTriangle,
  ArrowDown as LArrowDown,
  ArrowLeft as LArrowLeft,
  ArrowRight as LArrowRight,
  ArrowUp as LArrowUp,
  ArrowUpDown as LArrowUpDown,
  Bell as LBell,
  Building2 as LBuilding2,
  Calculator as LCalculator,
  Check as LCheck,
  CheckCircle as LCheckCircle,
  CheckCircle2 as LCheckCircle2,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  ChevronsUpDown as LChevronsUpDown,
  ChevronUp as LChevronUp,
  Circle as LCircle,
  Clock as LClock,
  Crop as LCrop,
  ExternalLink as LExternalLink,
  FlaskConical as LFlaskConical,
  GalleryVerticalEnd as LGalleryVerticalEnd,
  GitCompare as LGitCompare,
  GripVertical as LGripVertical,
  Image as LImage,
  ImagePlus as LImagePlus,
  Images as LImages,
  Info as LInfo,
  Loader2 as LLoader2,
  Lock as LLock,
  Mail as LMail,
  MessageSquare as LMessageSquare,
  Minus as LMinus,
  MoreHorizontal as LMoreHorizontal,
  MoreVertical as LMoreVertical,
  PanelLeft as LPanelLeft,
  Paperclip as LPaperclip,
  Pencil as LPencil,
  Phone as LPhone,
  PhoneOff as LPhoneOff,
  Plus as LPlus,
  Scale as LScale,
  Search as LSearch,
  Send as LSend,
  Server as LServer,
  Share2 as LShare2,
  Shield as LShield,
  Sparkles as LSparkles,
  Star as LStar,
  Trash2 as LTrash2,
  Trophy as LTrophy,
  RefreshCw as LRefreshCw,
  FileText as LFileText,
  Upload as LUpload,
  X as LX,
  XCircle as LXCircle,
  ZoomIn as LZoomIn,
  ZoomOut as LZoomOut,
  type LucideIcon,
} from "lucide-react";

import {
  Warning as PAlertTriangle,
  ArrowDown as PArrowDown,
  ArrowLeft as PArrowLeft,
  ArrowRight as PArrowRight,
  ArrowUp as PArrowUp,
  ArrowsDownUp as PArrowUpDown,
  Bell as PBell,
  Buildings as PBuilding2,
  Calculator as PCalculator,
  Check as PCheck,
  CheckCircle as PCheckCircle,
  CaretDown as PChevronDown,
  CaretLeft as PChevronLeft,
  CaretRight as PChevronRight,
  CaretUpDown as PChevronsUpDown,
  CaretUp as PChevronUp,
  Circle as PCircle,
  Clock as PClock,
  Crop as PCrop,
  ArrowSquareOut as PExternalLink,
  Flask as PFlaskConical,
  SquaresFour as PGalleryVerticalEnd,
  GitDiff as PGitCompare,
  DotsSixVertical as PGripVertical,
  Image as PImage,
  ImageSquare as PImagePlus,
  Images as PImages,
  Info as PInfo,
  CircleNotch as PLoader2,
  Lock as PLock,
  Envelope as PMail,
  ChatTeardropText as PMessageSquare,
  Minus as PMinus,
  DotsThree as PMoreHorizontal,
  DotsThreeVertical as PMoreVertical,
  SidebarSimple as PPanelLeft,
  Paperclip as PPaperclip,
  PencilSimple as PPencil,
  Phone as PPhone,
  PhoneSlash as PPhoneOff,
  Plus as PPlus,
  Scales as PScale,
  MagnifyingGlass as PSearch,
  PaperPlaneTilt as PSend,
  HardDrives as PServer,
  ShareNetwork as PShare2,
  Shield as PShield,
  Sparkle as PSparkles,
  Star as PStar,
  Trash as PTrash2,
  Trophy as PTrophy,
  ArrowsClockwise as PRefreshCw,
  FileText as PFileText,
  Upload as PUpload,
  X as PX,
  XCircle as PXCircle,
  MagnifyingGlassPlus as PZoomIn,
  MagnifyingGlassMinus as PZoomOut,
} from "@phosphor-icons/react";

import {
  MdOutlineWarningAmber as MAlertTriangle,
  MdOutlineArrowDownward as MArrowDown,
  MdOutlineArrowBack as MArrowLeft,
  MdOutlineArrowForward as MArrowRight,
  MdOutlineArrowUpward as MArrowUp,
  MdOutlineSwapVert as MArrowUpDown,
  MdOutlineNotifications as MBell,
  MdOutlineApartment as MBuilding2,
  MdOutlineCalculate as MCalculator,
  MdOutlineCheck as MCheck,
  MdOutlineCheckCircle as MCheckCircle,
  MdOutlineExpandMore as MChevronDown,
  MdOutlineChevronLeft as MChevronLeft,
  MdOutlineChevronRight as MChevronRight,
  MdOutlineUnfoldMore as MChevronsUpDown,
  MdOutlineExpandLess as MChevronUp,
  MdOutlineCircle as MCircle,
  MdOutlineSchedule as MClock,
  MdOutlineCrop as MCrop,
  MdOutlineOpenInNew as MExternalLink,
  MdOutlineScience as MFlaskConical,
  MdOutlineGridView as MGalleryVerticalEnd,
  MdOutlineCompareArrows as MGitCompare,
  MdOutlineDragIndicator as MGripVertical,
  MdOutlineImage as MImage,
  MdOutlineAddPhotoAlternate as MImagePlus,
  MdOutlineCollections as MImages,
  MdOutlineInfo as MInfo,
  MdOutlineAutorenew as MLoader2,
  MdOutlineLock as MLock,
  MdOutlineMail as MMail,
  MdOutlineChatBubbleOutline as MMessageSquare,
  MdOutlineRemove as MMinus,
  MdOutlineMoreHoriz as MMoreHorizontal,
  MdOutlineMoreVert as MMoreVertical,
  MdOutlineViewSidebar as MPanelLeft,
  MdOutlineAttachFile as MPaperclip,
  MdOutlineEdit as MPencil,
  MdOutlinePhone as MPhone,
  MdOutlinePhoneDisabled as MPhoneOff,
  MdOutlineAdd as MPlus,
  MdOutlineBalance as MScale,
  MdOutlineSearch as MSearch,
  MdOutlineSend as MSend,
  MdOutlineDns as MServer,
  MdOutlineShare as MShare2,
  MdOutlineShield as MShield,
  MdOutlineAutoAwesome as MSparkles,
  MdOutlineStarOutline as MStar,
  MdOutlineDeleteOutline as MTrash2,
  MdOutlineEmojiEvents as MTrophy,
  MdOutlineRefresh as MRefreshCw,
  MdOutlineDescription as MFileText,
  MdOutlineUploadFile as MUpload,
  MdOutlineClose as MX,
  MdOutlineCancel as MXCircle,
  MdOutlineZoomIn as MZoomIn,
  MdOutlineZoomOut as MZoomOut,
} from "react-icons/md";

type IconProps = SVGAttributes<SVGSVGElement> & { size?: number | string };

type LucideComp = LucideIcon;
type PhosphorComp = React.ComponentType<any>;
type MaterialComp = React.ComponentType<any>;

function themed(LIcon: LucideComp, PIcon: PhosphorComp, MIcon: MaterialComp, displayName: string) {
  const C = forwardRef<SVGSVGElement, IconProps>((props, ref) => {
    const iconSet = useIconSet();
    if (iconSet === "phosphor") {
      return <PIcon ref={ref} {...props} />;
    }
    if (iconSet === "material") {
      return <MIcon ref={ref} {...props} />;
    }
    return <LIcon ref={ref} {...props} />;
  });
  C.displayName = displayName;
  return C;
}

export const AlertTriangle = themed(LAlertTriangle, PAlertTriangle, MAlertTriangle, "AlertTriangle");
export const ArrowDown = themed(LArrowDown, PArrowDown, MArrowDown, "ArrowDown");
export const ArrowLeft = themed(LArrowLeft, PArrowLeft, MArrowLeft, "ArrowLeft");
export const ArrowRight = themed(LArrowRight, PArrowRight, MArrowRight, "ArrowRight");
export const ArrowUp = themed(LArrowUp, PArrowUp, MArrowUp, "ArrowUp");
export const ArrowUpDown = themed(LArrowUpDown, PArrowUpDown, MArrowUpDown, "ArrowUpDown");
export const Bell = themed(LBell, PBell, MBell, "Bell");
export const Building2 = themed(LBuilding2, PBuilding2, MBuilding2, "Building2");
export const Calculator = themed(LCalculator, PCalculator, MCalculator, "Calculator");
export const Check = themed(LCheck, PCheck, MCheck, "Check");
export const CheckCircle = themed(LCheckCircle, PCheckCircle, MCheckCircle, "CheckCircle");
export const CheckCircle2 = themed(LCheckCircle2, PCheckCircle, MCheckCircle, "CheckCircle2");
export const ChevronDown = themed(LChevronDown, PChevronDown, MChevronDown, "ChevronDown");
export const ChevronLeft = themed(LChevronLeft, PChevronLeft, MChevronLeft, "ChevronLeft");
export const ChevronRight = themed(LChevronRight, PChevronRight, MChevronRight, "ChevronRight");
export const ChevronsUpDown = themed(LChevronsUpDown, PChevronsUpDown, MChevronsUpDown, "ChevronsUpDown");
export const ChevronUp = themed(LChevronUp, PChevronUp, MChevronUp, "ChevronUp");
export const Circle = themed(LCircle, PCircle, MCircle, "Circle");
export const Clock = themed(LClock, PClock, MClock, "Clock");
export const Crop = themed(LCrop, PCrop, MCrop, "Crop");
export const ExternalLink = themed(LExternalLink, PExternalLink, MExternalLink, "ExternalLink");
export const FlaskConical = themed(LFlaskConical, PFlaskConical, MFlaskConical, "FlaskConical");
export const GalleryVerticalEnd = themed(LGalleryVerticalEnd, PGalleryVerticalEnd, MGalleryVerticalEnd, "GalleryVerticalEnd");
export const GitCompare = themed(LGitCompare, PGitCompare, MGitCompare, "GitCompare");
export const GripVertical = themed(LGripVertical, PGripVertical, MGripVertical, "GripVertical");
export const ImageIcon = themed(LImage, PImage, MImage, "ImageIcon");
export const ImagePlus = themed(LImagePlus, PImagePlus, MImagePlus, "ImagePlus");
export const Images = themed(LImages, PImages, MImages, "Images");
export const Info = themed(LInfo, PInfo, MInfo, "Info");
export const Loader2 = themed(LLoader2, PLoader2, MLoader2, "Loader2");
export const Lock = themed(LLock, PLock, MLock, "Lock");
export const Mail = themed(LMail, PMail, MMail, "Mail");
export const MessageSquare = themed(LMessageSquare, PMessageSquare, MMessageSquare, "MessageSquare");
export const Minus = themed(LMinus, PMinus, MMinus, "Minus");
export const MoreHorizontal = themed(LMoreHorizontal, PMoreHorizontal, MMoreHorizontal, "MoreHorizontal");
export const PanelLeft = themed(LPanelLeft, PPanelLeft, MPanelLeft, "PanelLeft");
export const Paperclip = themed(LPaperclip, PPaperclip, MPaperclip, "Paperclip");
export const Pencil = themed(LPencil, PPencil, MPencil, "Pencil");
export const Phone = themed(LPhone, PPhone, MPhone, "Phone");
export const PhoneOff = themed(LPhoneOff, PPhoneOff, MPhoneOff, "PhoneOff");
export const Plus = themed(LPlus, PPlus, MPlus, "Plus");
export const Scale = themed(LScale, PScale, MScale, "Scale");
export const Search = themed(LSearch, PSearch, MSearch, "Search");
export const Send = themed(LSend, PSend, MSend, "Send");
export const Server = themed(LServer, PServer, MServer, "Server");
export const Share2 = themed(LShare2, PShare2, MShare2, "Share2");
export const Shield = themed(LShield, PShield, MShield, "Shield");
export const Sparkles = themed(LSparkles, PSparkles, MSparkles, "Sparkles");
export const Star = themed(LStar, PStar, MStar, "Star");
export const Trash2 = themed(LTrash2, PTrash2, MTrash2, "Trash2");
export const Trophy = themed(LTrophy, PTrophy, MTrophy, "Trophy");
export const RefreshCw = themed(LRefreshCw, PRefreshCw, MRefreshCw, "RefreshCw");
export const FileText = themed(LFileText, PFileText, MFileText, "FileText");
export const Upload = themed(LUpload, PUpload, MUpload, "Upload");
export const X = themed(LX, PX, MX, "X");
export const XCircle = themed(LXCircle, PXCircle, MXCircle, "XCircle");
export const ZoomIn = themed(LZoomIn, PZoomIn, MZoomIn, "ZoomIn");
export const ZoomOut = themed(LZoomOut, PZoomOut, MZoomOut, "ZoomOut");

export const ArrowDownIcon = ArrowDown;
export const ArrowUpIcon = ArrowUp;
export const CheckIcon = Check;
export const ChevronDownIcon = ChevronDown;
export const ChevronLeftIcon = ChevronLeft;
export const ChevronRightIcon = ChevronRight;
export const ChevronsLeftIcon = ChevronLeft;
export const ChevronsRightIcon = ChevronRight;
export const GripVerticalIcon = GripVertical;
export const Loader2Icon = Loader2;
export const LoaderIcon = Loader2;
export const MoreHorizontalIcon = MoreHorizontal;
export const MoreVerticalIcon = themed(
  LMoreVertical, PMoreVertical, MMoreVertical, "MoreVerticalIcon"
);
export const PhoneIcon = Phone;
export const XIcon = X;

export type { LucideIcon };
