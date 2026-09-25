import {
  CalendarDays,
  MessageCircle,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import type { AskIdea } from "@/lib/start-intent";
import type { Translate } from "@/lib/i18n-context";

export const ASK_IDEAS: ReadonlyArray<{
  id: AskIdea;
  icon: LucideIcon;
  titleKey: string;
  detailKey: string;
  tint: string;
}> = [
  {
    id: "explain",
    icon: MessageCircle,
    tint: "text-accent",
    titleKey: "home.askTitle",
    detailKey: "home.askDetail",
  },
  {
    id: "practise",
    icon: Pencil,
    tint: "text-tint-green",
    titleKey: "home.practiseTitle",
    detailKey: "home.practiseDetail",
  },
  {
    id: "plan",
    icon: CalendarDays,
    tint: "text-tint-purple",
    titleKey: "home.planTitle",
    detailKey: "home.planDetail",
  },
];

/** Nothing is sent on the learner's behalf; "explain" starts empty. */
export function draftFor(
  idea: AskIdea,
  topic: string | null,
  t: Translate,
): string | undefined {
  if (idea === "practise") {
    return topic
      ? t("home.practiseDraft", { topic })
      : t("home.practiseDraftAny");
  }
  if (idea === "plan") return t("home.planDraft");
  return undefined;
}
