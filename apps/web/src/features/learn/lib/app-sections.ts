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

/** Ask says what it takes while nobody is signed in: the chat is for an account's learner. */
export const labelKeyOf = (section: Section, signedIn: boolean): string =>
  section.id === "ask" && !signedIn ? "signIn.link" : section.labelKey;

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

const LEARN = "/app/learn";

const trimmed = (pathname: string) => pathname.replace(/\/+$/, "");

/** Where a page leads that the learner does not have, or has as Home: to Home, which for a
 * class that learns by voice alone is its voice lessons. Null for a page they have. */
export function pageRedirect(
  pathname: string,
  voiceOnly: boolean,
): string | null {
  const homeElsewhere = voiceOnly && trimmed(pathname) === VOICE_PAGE;
  return pageShown(pathname, voiceOnly) && !homeElsewhere ? null : LEARN;
}

export const DETAILS_PAGE = `${LEARN}/you/details`;
export const LEARNERS_PAGE = `${LEARN}/you/learners`;

export function sectionOf(pathname: string): AppSection {
  const path = trimmed(pathname);
  // Voice lessons open from Home.
  if (
    path === LEARN ||
    path === VOICE_PAGE ||
    path.startsWith(`${VOICE_PAGE}/`)
  )
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

/** Home and Subjects, where nothing is being read, answered or heard. */
export function isRestPage(pathname: string): boolean {
  const path = trimmed(pathname);
  return SECTIONS.some(
    (section) =>
      (section.id === "home" || section.id === "subjects") &&
      section.path === path,
  );
}

export function isChatPath(pathname: string): boolean {
  return trimmed(pathname).startsWith(`${ASK_HUB}/`);
}

/** What a page looks like before its data is in, so the screen can hold that shape meanwhile. */
export type PageShape = "home" | "subject" | "list";

// The first path segments under /app/learn that are not a subject's slug.
const NOT_A_SUBJECT = new Set(["subjects", "you", "plan", "voice", "ask"]);

export function pageShape(pathname: string): PageShape {
  const path = trimmed(pathname);
  if (path === LEARN) return "home";
  const subject = matchPath(`${LEARN}/:subject`, path)?.params.subject;
  return subject && !NOT_A_SUBJECT.has(subject) ? "subject" : "list";
}
