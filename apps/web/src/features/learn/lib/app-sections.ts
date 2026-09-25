import {
  BookOpen,
  House,
  MessageCircle,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { matchPath } from "react-router";
import { ASK_HUB, type ChatTarget } from "./chat-targets";

export type AppSection = "home" | "subjects" | "ask" | "you";

export const SECTIONS: ReadonlyArray<{
  id: AppSection;
  path: string;
  labelKey: string;
  icon: LucideIcon;
}> = [
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

const LEARN = "/app/learn";

export const DETAILS_PAGE = `${LEARN}/you/details`;
export const LEARNERS_PAGE = `${LEARN}/you/learners`;

export function sectionOf(pathname: string): AppSection {
  const path = pathname.replace(/\/+$/, "");
  if (path === LEARN) return "home";
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
