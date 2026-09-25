import { cn } from "@/lib/cn";

interface ProgressBarProps {
  percent: number;
  /** Empty when the same figure is already given as text beside it. */
  label: string;
  className?: string;
}

export function ProgressBar({ percent, label, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={cn("h-1.5 overflow-hidden rounded-full bg-track", className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
