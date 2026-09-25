import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface SubjectChecklistProps {
  names: string[];
  chosen: string[];
  limit: number;
  disabled: boolean;
  onToggle: (name: string) => void;
}

export function SubjectChecklist({
  names,
  chosen,
  limit,
  disabled,
  onToggle,
}: SubjectChecklistProps) {
  const full = chosen.length >= limit;
  return (
    <ul className="space-y-1.5">
      {names.map((name) => {
        const isChosen = chosen.includes(name);
        return (
          <li key={name}>
            <SubjectCheck
              name={name}
              chosen={isChosen}
              disabled={disabled || (full && !isChosen)}
              onToggle={() => onToggle(name)}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface SubjectCheckProps {
  name: string;
  chosen: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function SubjectCheck({ name, chosen, disabled, onToggle }: SubjectCheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={chosen}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-control border px-4 py-3 text-start transition disabled:cursor-not-allowed disabled:opacity-60",
        chosen
          ? "border-accent bg-accent-soft"
          : "border-line bg-surface hover:border-accent",
      )}
    >
      <span
        className={cn(
          "min-w-0 text-sm font-semibold",
          chosen ? "text-accent-ink" : "text-ink",
        )}
      >
        {name}
      </span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          chosen ? "border-accent bg-accent text-white" : "border-line",
        )}
      >
        {chosen && <Check className="size-4" aria-hidden="true" />}
      </span>
    </button>
  );
}
