import { cn } from "@/lib/cn";

export type Variant = "primary" | "secondary" | "ghost";
export type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-accent-soft",
  ghost: "text-ink hover:bg-accent-soft",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-5 py-2.5 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2",
};

/** For links styled as buttons; `<Button>` for buttons. */
export function buttonStyles(
  variant: Variant = "primary",
  size: Size = "md",
): string {
  return cn(
    "inline-flex items-center justify-center rounded-control font-semibold",
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
  );
}
