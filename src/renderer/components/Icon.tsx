import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  ChevronRight,
  CircleSlash,
  Clock,
  Code2,
  Command,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Github,
  Globe,
  History,
  KeyRound,
  LayoutGrid,
  MoreHorizontal,
  Moon,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCw,
  Search,
  Shield,
  Sparkles,
  Square,
  SquareSplitHorizontal,
  Star,
  Sun,
  Trash2,
  UserRound,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import type { LucideProps } from "lucide-react";

const iconMap = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  briefcase: Briefcase,
  chevronRight: ChevronRight,
  clock: Clock,
  code: Code2,
  command: Command,
  copy: Copy,
  download: Download,
  folder: FolderOpen,
  docs: FileText,
  github: Github,
  globe: Globe,
  grid: LayoutGrid,
  history: History,
  key: KeyRound,
  linear: CircleSlash,
  menu: MoreHorizontal,
  moon: Moon,
  panel: PanelLeft,
  pencil: Pencil,
  pin: Pin,
  pinOff: PinOff,
  plus: Plus,
  reader: BookOpen,
  reload: RotateCw,
  search: Search,
  shield: Shield,
  sparkle: Sparkles,
  split: SquareSplitHorizontal,
  square: Square,
  star: Star,
  sun: Sun,
  trash: Trash2,
  user: UserRound,
  volume: Volume2,
  volumeMute: VolumeX,
  close: X
};

export type IconName = keyof typeof iconMap;

type IconProps = LucideProps & {
  name: IconName;
};

export default function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: IconProps) {
  const Component = iconMap[name];
  return <Component aria-hidden="true" size={size} strokeWidth={strokeWidth} {...props} />;
}
