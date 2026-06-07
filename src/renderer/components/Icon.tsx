import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  ChevronRight,
  CircleSlash,
  Clock,
  Code2,
  Command,
  FileText,
  Github,
  Globe,
  History,
  LayoutGrid,
  MoreHorizontal,
  Moon,
  PanelLeft,
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
  UserRound,
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
  docs: FileText,
  github: Github,
  globe: Globe,
  grid: LayoutGrid,
  history: History,
  linear: CircleSlash,
  menu: MoreHorizontal,
  moon: Moon,
  panel: PanelLeft,
  pin: Pin,
  pinOff: PinOff,
  plus: Plus,
  reload: RotateCw,
  search: Search,
  shield: Shield,
  sparkle: Sparkles,
  split: SquareSplitHorizontal,
  square: Square,
  star: Star,
  sun: Sun,
  user: UserRound,
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
