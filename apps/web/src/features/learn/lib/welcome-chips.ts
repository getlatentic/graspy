import type { ThreadScope } from "@/lib/chat-db";
import type { Translate } from "@/lib/i18n-context";
import { draftFor } from "./ask-ideas";
import type { CurrentTopic } from "./current-topic";

/** A suggestion under the welcome of an empty chat. */
export interface WelcomeChip {
  label: string;
  run: () => void;
}

interface ChipSources {
  scope: ThreadScope;
  subjectName: string;
  /** Where the learner is in their plan; null before there is one. */
  current: CurrentTopic | null;
  /** A learner with no subjects yet is being asked what they would like to learn. */
  starting: boolean;
  t: Translate;
  /** Sends the words as a question. */
  ask: (text: string) => void;
  /** Puts the words in the composer for the learner to finish and send. */
  fill: (text: string) => void;
}

const TOPIC_QUESTIONS = [
  { label: "chat.quickActionExplain", prompt: "chat.quickActionExplainPrompt" },
  {
    label: "chat.quickActionExamples",
    prompt: "chat.quickActionExamplesPrompt",
  },
  { label: "chat.quickActionRelated", prompt: "chat.quickActionRelatedPrompt" },
] as const;

/** A topic offers three questions that are sent as they are; the general chat offers to start a
 * practice or a plan in the composer. A subject chat and the first chat of a new learner offer none. */
export function welcomeChips(sources: ChipSources): WelcomeChip[] {
  const { scope, subjectName, current, starting, t, ask, fill } = sources;
  if (scope.kind === "topic") {
    const values = { topic: scope.topic, subject: subjectName };
    return TOPIC_QUESTIONS.map(({ label, prompt }) => ({
      label: t(label),
      run: () => ask(t(prompt, values)),
    }));
  }
  if (scope.kind !== "general" || starting) return [];
  return [
    {
      label: t("home.practiseTitle"),
      run: () => fill(draftFor("practise", current?.topic ?? null, t) ?? ""),
    },
    {
      label: t("home.planTitle"),
      run: () => fill(draftFor("plan", null, t) ?? ""),
    },
  ];
}
