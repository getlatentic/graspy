import {
  Atom,
  BookMarked,
  BookOpen,
  Calculator,
  Dna,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  Landmark,
  Languages,
  Laptop,
  Music,
  Palette,
  Pi,
  Scale,
  Sigma,
  TrendingUp,
  Wheat,
  type LucideIcon,
} from "lucide-react";

// Generated subject names are an open set: match keywords, first match wins
// ("English Language" is a book), and localised names get the fallback.
type SubjectTint = "blue" | "green" | "orange" | "purple";

const SUBJECTS: Array<[readonly string[], LucideIcon, SubjectTint]> = [
  // Before plain maths so a path like "Real Analysis" gets its own icon.
  [["analysis", "calculus", "further math"], Sigma, "blue"],
  [
    ["math", "algebra", "geometry", "statistic", "arithmetic", "trigonometry"],
    Pi,
    "blue",
  ],
  [["english", "literature", "reading"], BookOpen, "orange"],
  [["language", "grammar", "writing"], Languages, "orange"],
  [["history", "government", "civic"], Landmark, "purple"],
  [["chemistry", "science"], FlaskConical, "green"],
  [["physics"], Atom, "green"],
  [["biology", "health"], Dna, "green"],
  [["geography", "social studies"], Globe, "green"],
  [["economic", "commerce"], TrendingUp, "blue"],
  [["account", "business", "financial"], Calculator, "blue"],
  [["law", "justice"], Scale, "purple"],
  [["computer", "ict", "technology", "coding"], Laptop, "purple"],
  [["agric", "farming"], Wheat, "green"],
  [["physical education", "sport"], Dumbbell, "green"],
  [["art", "design", "craft"], Palette, "orange"],
  [["music"], Music, "orange"],
  [["religio", "islamic", "christian", "moral"], BookMarked, "purple"],
];

function match(name: string) {
  const key = name.toLowerCase();
  return SUBJECTS.find(([words]) => words.some((w) => key.includes(w)));
}

export function subjectIcon(name: string): LucideIcon {
  return match(name)?.[1] ?? GraduationCap;
}

const TINT_CLASSES: Record<SubjectTint, string> = {
  blue: "bg-accent-soft text-accent-ink",
  green: "bg-tint-green-soft text-tint-green",
  orange: "bg-tint-orange-soft text-tint-orange",
  purple: "bg-tint-purple-soft text-tint-purple",
};

const TINTS = Object.keys(TINT_CLASSES) as SubjectTint[];

/** Stable per name, so unknown subjects do not all share one colour. */
function tintFromName(name: string): SubjectTint {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function subjectTintClasses(name: string): string {
  return TINT_CLASSES[match(name)?.[2] ?? tintFromName(name)];
}
