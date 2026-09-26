import {
  BookOpen,
  House,
  MessageCircle,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { matchPath } from "react-router";
import { VOICE_PAGE } from "@/features/voice/lib/voice-paths";
import { ASK_HUB, type ChatTarget } from "./chat-targets";

export type AppSection = "home" | "subjects" | "ask" | "you";

export interface Section {
  id: AppSection;
  path: string;
  labelKey: string;
  icon: LucideIcon;
}

export const SECTIONS: readonly Section[] = [
  { id: "home", path: "/app/learn", labelKey: "nav.home", icon: House },
  {
    id: "subjects",
    path: "/app/learn/subjects",
    labelKey: "nav.subjects",
    icon: BookOpen,
  },
  { id: "ask", path: ASK_HUB, labelKey: "nav.ask", icon: MessageCircle },
  { id: "you", path: "/app/learn/you", labelKey: "nav.you", icon: UserRound },
];

// Subjects and Ask are read, so a class that learns by voice alone has neither.
const VOICE_ONLY_SECTIONS = SECTIONS.filter(
  ({ id }) => id === "home" || id === "you",
);

export const sectionsFor = (voiceOnly: boolean) =>
  voiceOnly ? VOICE_ONLY_SECTIONS : SECTIONS;

/** Whether a page is in a section the learner has: a slide lesson, say, is not for a class
 * that learns by voice alone. */
export const pageShown = (pathname: string, voiceOnly: boolean): boolean =>
  sectionsFor(voiceOnly).some(({ id }) => id === sectionOf(pathname));

/** Where a page the learner does not have leads: to their voice lessons. Null for a page
 * they have. */
export const pageRedirect = (
  pathname: string,
  voiceOnly: boolean,
): string | null => (pageShown(pathname, voiceOnly) ? null : VOICE_PAGE);

const LEARN = "/app/learn";

export const DETAILS_PAGE = `${LEARN}/you/details`;
export const LEARNERS_PAGE = `${LEARN}/you/learners`;

export function sectionOf(pathname: string): AppSection {
  const path = pathname.replace(/\/+$/, "");
  // Voice lessons open from Home.
  const voice = `${LEARN}/voice`;
  if (path === LEARN || path === voice || path.startsWith(`${voice}/`))
    return "home";
  if (path === `${LEARN}/you` || path.startsWith(`${LEARN}/you/`)) return "you";
  if (path === ASK_HUB || path.startsWith(`${ASK_HUB}/`)) return "ask";
  return "subjects";
}

export function lessonChatTarget(pathname: string): ChatTarget | null {
  const match = matchPath(`${LEARN}/:subject/lesson/:topicIndex`, pathname);
  if (!match?.params.subject) return null;
  const topicIndex = Number(match.params.topicIndex);
  return Number.isInteger(topicIndex)
    ? {
        kind: "topic",
        subjectSlug: decodeURIComponent(match.params.subject),
        topicIndex,
      }
    : null;
}

export function isChatPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "").startsWith(`${ASK_HUB}/`);
}
