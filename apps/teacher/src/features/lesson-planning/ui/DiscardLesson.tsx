import { useState } from "react";

import { Button } from "@carbon/react";

/**
 * Clearing a lesson a teacher has decided not to teach.
 *
 * A start nobody finished stays in the list for ever otherwise, and a class with
 * several of them stops saying what is still owed. Only a draft is offered this:
 * once a lesson is confirmed it is a document a school may hold, and graspy
 * keeps it.
 *
 * Asking first is the point. It reads as an ordinary neighbour of Edit until
 * pressed, then names what goes, because a teacher who meant to press Edit must
 * not lose an afternoon's work to one slip.
 */
export function DiscardLesson({
  covers,
  pending,
  onDiscard,
}: {
  readonly covers: string;
  readonly pending: boolean;
  readonly onDiscard: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button kind="danger--ghost" onClick={() => setArmed(true)}>
        Discard lesson
      </Button>
    );
  }
  return (
    <div className="grid gap-sm">
      <p className="m-0 max-w-[65ch] leading-body text-ink-secondary">
        Discard <strong className="font-semibold text-ink">{covers}</strong>, with the plan and
        everything written into it? You cannot get it back.
      </p>
      <div className="flex flex-wrap gap-sm">
        <Button kind="danger--ghost" disabled={pending} onClick={onDiscard}>
          Yes, discard it
        </Button>
        <Button kind="ghost" onClick={() => setArmed(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
