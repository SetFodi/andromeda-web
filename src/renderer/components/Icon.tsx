import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  ChevronRight,
  CircleSlash,
  Code2,
  FileText,
  Github,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RotateCw,
  Search,
  Shield,
  Sparkles,
  Square,
  Sun,
  UserRound
} from "lucide-react";
import type { LucideProps } from "lucide-react";

const iconMap = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  briefcase: Briefcase,
  chevronRight: ChevronRight,
  code: Code2,
  docs: FileText,
  github: Github,
  linear: CircleSlash,
  menu: MoreHorizontal,
  panel: PanelLeft,
  plus: Plus,
  reload: RotateCw,
  search: Search,
  shield: Shield,
  sparkle: Sparkles,
  square: Square,
  sun: Sun,
  user: UserRound
};

export type IconName = keyof typeof iconMap;

type IconProps = LucideProps & {
  name: IconName;
};

export default function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: IconProps) {
  const Component = iconMap[name];
  return <Component aria-hidden="true" size={size} strokeWidth={strokeWidth} {...props} />;
}
