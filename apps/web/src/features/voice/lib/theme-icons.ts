import {
  Banknote,
  Clock,
  Hash,
  PieChart,
  Plus,
  Shapes,
  Sparkles,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";

/** The picture for each theme of the class, by the theme's key. */
const THEME_ICONS: Record<string, LucideIcon> = {
  alphabet: Type,
  number: Hash,
  operations: Plus,
  multiplication: X,
  time: Clock,
  money: Banknote,
  shapes: Shapes,
  fractions: PieChart,
};

/** A theme the map does not know still gets a picture. */
export const NEUTRAL_THEME_ICON: LucideIcon = Sparkles;

export const themeIcon = (topic: string): LucideIcon =>
  Object.hasOwn(THEME_ICONS, topic) ? THEME_ICONS[topic] : NEUTRAL_THEME_ICON;
