import { cn } from "@/lib/cn";

/** An on/off setting: the whole row, label included, is the control. */
export function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-control text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="font-semibold text-ink">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none",
          checked ? "bg-accent" : "bg-faint",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] motion-reduce:transition-none",
            checked ? "start-6" : "start-1",
          )}
        />
      </span>
    </button>
  );
}
