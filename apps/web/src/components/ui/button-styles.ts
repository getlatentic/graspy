import { cn } from "@/lib/cn";

export type Variant = "primary" | "secondary" | "ghost";
export type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent shadow-press hover:bg-accent-strong active:translate-y-0.5 active:shadow-none disabled:shadow-none",
  secondary:
    "border border-accent-line bg-accent-soft text-accent-ink hover:border-accent",
  ghost: "text-accent-ink hover:bg-accent-soft",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5 pointer-coarse:min-h-11",
  md: "px-5 py-3 text-base gap-2",
  lg: "px-6 py-4 text-lg gap-2",
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
