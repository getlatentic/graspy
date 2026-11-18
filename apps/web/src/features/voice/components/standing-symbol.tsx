import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Standing } from "@/lib/voice/voice-types";

/** A ring, with the left half filled once the lesson is started. */
function Ring({ half }: { half: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-symbol={half ? "started" : "untouched"}
      className={cn("size-6 shrink-0", half ? "text-accent" : "text-faint")}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {half && <path d="M12 6a6 6 0 0 0 0 12z" fill="currentColor" />}
    </svg>
  );
}

function Tick({ standing }: { standing: "learnt" | "mastered" }) {
  return (
    <span
      aria-hidden="true"
      data-symbol={standing}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-on-accent",
        // Green is only for what is known.
        standing === "mastered" ? "bg-success" : "bg-accent",
      )}
    >
      <Check className="size-4" strokeWidth={3} />
    </span>
  );
}

/** Where the learner stands on a lesson, drawn: an empty ring, a half ring, a blue tick, a green tick.
 * Decoration only; the words for it travel as hidden text beside it. */
export function StandingSymbol({ standing }: { standing: Standing }) {
  if (standing === "mastered" || standing === "learnt")
    return <Tick standing={standing} />;
  return <Ring half={standing === "started"} />;
}
