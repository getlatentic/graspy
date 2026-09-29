import type { ComponentProps, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface p-5",
        className,
      )}
      {...props}
    />
  );
}

export function SectionLabel({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-widest text-muted",
        className,
      )}
      {...props}
    />
  );
}
