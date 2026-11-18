import type { Standing } from "@/lib/voice/voice-types";
import { badgeFor } from "../lib/standing-badges";

/** Where the learner stands on a lesson, drawn: an empty ring, a half ring, a blue tick, a crowned star.
 * Decoration only; the words for it travel as hidden text beside it. */
export function StandingBadge({ standing }: { standing: Standing }) {
  return (
    <img
      src={badgeFor(standing)}
      alt=""
      width={128}
      height={128}
      data-standing={standing}
      className="size-9 shrink-0"
    />
  );
}
