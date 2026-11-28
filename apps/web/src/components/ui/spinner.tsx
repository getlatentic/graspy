import { cn } from "@/lib/cn";

/** currentColor borders, so it never goes invisible on its surface. */
export function Spinner({
  className,
  label,
  decorative = false,
}: {
  className?: string;
  /** What is being waited for, for those who cannot see it turn. */
  label?: string;
  /** Something beside it says what is awaited, so it is not announced itself. */
  decorative?: boolean;
}) {
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60",
        className,
      )}
    />
  );
}
