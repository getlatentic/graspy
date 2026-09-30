import type { Run, Turn } from "./turn-log.ts";
import { hearingFidelity, wordsOf } from "./words.ts";

export interface Finding {
  check: string;
  /** "concern" is something a reviewer should look at; "note" is context for reading the run. */
  severity: "concern" | "note";
  turn: number | null;
  detail: string;
}

const FAITHFUL = 0.8;
const LONGEST_LINE_WORDS = 25;
const SAME_LINE_LIMIT = 3;
const LONGEST_WAIT_MS = 8_000;
const EVENT_ORDER = [
  "gain_attention",
  "inform_objectives",
  "stimulate_recall",
  "present_content",
  "provide_guidance",
  "elicit_performance",
  "provide_feedback",
  "assess_performance",
  "enhance_retention",
];

const finding = (
  check: string,
  severity: Finding["severity"],
  turn: number | null,
  detail: string,
): Finding => ({ check, severity, turn, detail });

function hearing(turn: Turn): number | null {
  if (!turn.child?.said || !turn.marking) return null;
  return hearingFidelity(turn.child.said, turn.marking.heard);
}

/** Where the recogniser, not the teacher, may be at fault: read the marking checks with these. */
export function hearingFindings(run: Run): Finding[] {
  return run.turns.flatMap((turn) => {
    const fidelity = hearing(turn);
    if (fidelity === null || fidelity >= FAITHFUL) return [];
    return [
      finding(
        "recogniser-misheard",
        "note",
        turn.index,
        `Child said "${turn.child?.said}", recogniser heard "${turn.marking?.heard}".`,
      ),
    ];
  });
}

/** A faithfully heard answer marked against what it was. */
export function markingFindings(run: Run): Finding[] {
  return run.turns.flatMap((turn) => {
    const fidelity = hearing(turn);
    const truth = turn.child?.isRight;
    if (!turn.marking || fidelity === null || fidelity < FAITHFUL || typeof truth !== "boolean") return [];
    const said = `"${turn.child?.said}" (heard "${turn.marking.heard}")`;
    if (truth && turn.marking.decision !== "correct")
      return [finding("right-answer-not-accepted", "concern", turn.index, `${said} is right, marked ${turn.marking.decision}.`)];
    if (!truth && turn.marking.decision === "correct")
      return [finding("wrong-answer-accepted", "concern", turn.index, `${said} is wrong, marked correct.`)];
    return [];
  });
}

/** The same teacher line, offered over and over, is a child stuck in a loop. */
export function loopFindings(run: Run): Finding[] {
  const found: Finding[] = [];
  let streak = 1;
  for (let i = 1; i < run.turns.length; i++) {
    const same = run.turns[i].move.says === run.turns[i - 1].move.says;
    streak = same ? streak + 1 : 1;
    if (streak === SAME_LINE_LIMIT)
      found.push(finding("same-line-repeated", "concern", run.turns[i].index, `"${run.turns[i].move.says}" has been said ${SAME_LINE_LIMIT} times running.`));
  }
  return found;
}

/** Feedback that says the same thing twice to a child who is still wrong helps no one. */
export function feedbackFindings(run: Run): Finding[] {
  const found: Finding[] = [];
  const marked = run.turns.filter((turn) => turn.marking && turn.marking.decision !== "correct");
  for (let i = 1; i < marked.length; i++) {
    if (marked[i].marking?.feedback === marked[i - 1].marking?.feedback)
      found.push(finding("feedback-repeated", "concern", marked[i].index, `Same feedback twice: "${marked[i].marking?.feedback}".`));
  }
  return found;
}

/**
 * Lines a young child cannot hold in mind. The teacher's reply to an answer is checked as a concern, since the
 * tutor writes it and holds it to a length. A line the lesson plan wrote is the same for every child and is
 * content for its authors to shorten, so it is a note.
 */
export function lengthFindings(run: Run): Finding[] {
  return run.turns.flatMap((turn) => {
    const found: Finding[] = [];
    const reply = turn.marking?.feedback ?? "";
    if (wordsOf(reply).length > LONGEST_LINE_WORDS)
      found.push(finding("line-too-long", "concern", turn.index, `${wordsOf(reply).length} words: "${reply}".`));
    const planned = wordsOf(turn.move.says).length;
    if (planned > LONGEST_LINE_WORDS)
      found.push(finding("plan-line-long", "note", turn.index, `The lesson plan's line is ${planned} words: "${turn.move.says}".`));
    return found;
  });
}

/** A child who says nothing should be answered, not left looking at a still screen. */
export function silenceFindings(run: Run): Finding[] {
  return run.turns.flatMap((turn) =>
    turn.child && turn.child.said === null && !turn.marking && !turn.pageNote
      ? [finding("silence-unanswered", "concern", turn.index, "The child said nothing and the page said nothing back.")]
      : [],
  );
}

/** A child waits, watching a still screen, for the answer to be marked. */
export function waitFindings(run: Run): Finding[] {
  return run.turns.flatMap((turn) =>
    turn.replyWaitMs !== null && turn.replyWaitMs > LONGEST_WAIT_MS
      ? [finding("slow-reply", "concern", turn.index, `${(turn.replyWaitMs / 1000).toFixed(1)} s from the end of the answer to the page's outcome.`)]
      : [],
  );
}

/** An answer the child gave that was never marked leaves them without feedback. */
export function unmarkedFindings(run: Run): Finding[] {
  return run.turns.flatMap((turn) =>
    turn.child?.said && !turn.marking && turn.pageNote
      ? [finding("answer-not-marked", "concern", turn.index, `The child answered "${turn.child.said}" and the page said: "${turn.pageNote}".`)]
      : [],
  );
}

/**
 * The teacher's events should follow the nine events of instruction within a lesson, not jump back. A new lesson
 * starts the order again, and the plan's guided practice comes round again after a miss, as it should.
 */
export function orderFindings(run: Run): Finding[] {
  const found: Finding[] = [];
  let highest = -1;
  let lesson: string | null = null;
  let lastAnswered: Turn | null = null;
  for (const turn of run.turns) {
    if (turn.move.planId !== lesson) {
      lesson = turn.move.planId;
      highest = -1;
    }
    const rank = turn.move.event ? EVENT_ORDER.indexOf(turn.move.event) : -1;
    if (rank >= 0) {
      const reteach = turn.move.event === "provide_guidance" && lastAnswered?.marking && lastAnswered.marking.decision !== "correct";
      if (rank < highest && !reteach)
        found.push(finding("event-out-of-order", "note", turn.index, `${turn.move.event} came after ${EVENT_ORDER[highest]}.`));
      highest = Math.max(highest, rank);
    }
    if (turn.marking) lastAnswered = turn;
  }
  return found;
}

export function checkRun(run: Run): Finding[] {
  return [
    ...hearingFindings(run),
    ...markingFindings(run),
    ...loopFindings(run),
    ...feedbackFindings(run),
    ...lengthFindings(run),
    ...silenceFindings(run),
    ...waitFindings(run),
    ...unmarkedFindings(run),
    ...orderFindings(run),
  ];
}
