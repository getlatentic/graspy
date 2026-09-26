import { useEffect, useRef, type CSSProperties } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { cn } from "@/lib/cn";
import TopMenu from "@/features/learn/components/top-menu";
import { ChatView } from "@/features/learn/components/chat-view";
import { ChatContextBar } from "@/features/learn/components/chat-context-bar";
import { TutorAskBar } from "@/features/learn/components/tutor-ask-bar";
import { AppTabBar } from "@/features/learn/components/app-tab-bar";
import { useOpenChat } from "@/features/learn/hooks/use-open-chat";
import { useLearnerChosen } from "@/features/learn/hooks/use-learner-chosen";
import { useLearnerStart } from "@/features/learn/hooks/use-learner-start";
import { useKeptAnswers } from "@/features/voice/hooks/use-kept-answers";
import { useVoiceOnly } from "@/features/voice/hooks/use-voice-learner";
import {
  isChatPath,
  lessonChatTarget,
  pageRedirect,
  sectionsFor,
  type Section,
} from "@/features/learn/lib/app-sections";
import { scopeOf, type ChatTarget } from "@/features/learn/lib/chat-targets";
import { LearnerProviders } from "@/features/learn/learner-providers";
import { useChat, usePlan } from "@/features/learn/learner-context";

// Tailwind's lg breakpoint, where a lesson's conversation sits beside it.
const WIDE_SCREEN = "(min-width: 64rem)";

function DashboardLayoutContent() {
  const { pathname } = useLocation();
  const userProfile = useLearnerStart();
  useKeptAnswers();
  const voiceOnly = useVoiceOnly() === true;
  const redirect = pageRedirect(pathname, voiceOnly);
  const sections = sectionsFor(voiceOnly);
  const chat = isChatPath(pathname);
  const lesson = redirect ? null : lessonChatTarget(pathname);
  // iOS keeps dvh at full height while the keyboard is open.
  const visible = useVisualViewport(chat);

  if (!userProfile) return null;

  return (
    <div
      style={
        visible
          ? ({
              "--visible-top": `${visible.top}px`,
              "--visible-height": `${visible.height}px`,
            } as CSSProperties)
          : undefined
      }
      className={cn(
        "group/shell flex flex-col overflow-hidden bg-canvas",
        chat
          ? "fixed inset-x-0 top-[var(--visible-top,0px)] h-[var(--visible-height,100dvh)]"
          : "h-dvh",
      )}
    >
      <TopMenu sections={sections} />
      <div className="flex min-h-0 flex-1">
        <PageArea chat={chat} redirect={redirect} />
        {lesson && <LessonChat lesson={lesson} />}
      </div>
      <ShellFooter lesson={lesson} chat={chat} sections={sections} />
    </div>
  );
}

// Relative, so absolutely placed screen-reader text scrolls inside it rather
// than stretching the document below the app. A page the learner's sections do
// not hold, such as a slide lesson for a class that learns by voice alone, leads
// to voice lessons.
function PageArea({
  chat,
  redirect,
}: {
  chat: boolean;
  redirect: string | null;
}) {
  const pageRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // Drawn before the saved plan is read, a page would flash its placeholder.
  const { isLoaded } = usePlan();

  // The page scrolls inside the shell, so it would keep the last page's offset.
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <main
      ref={pageRef}
      className={cn(
        "relative min-h-0 min-w-0 flex-1",
        // Not a flex column for other pages: there a page's mx-auto wrapper
        // shrinks to its content and can outgrow the screen.
        chat
          ? "flex flex-col"
          : "overflow-y-auto overscroll-contain p-4 sm:p-6",
      )}
    >
      {isLoaded && (redirect ? <Navigate to={redirect} replace /> : <Outlet />)}
    </main>
  );
}

function LessonChat({ lesson }: { lesson: ChatTarget }) {
  const { pathname } = useLocation();
  const { curriculum } = usePlan();
  const wide = useMediaQuery(WIDE_SCREEN);
  const scope = scopeOf(lesson, curriculum);
  if (!wide || !scope) return null;
  return (
    <aside className="flex w-90 shrink-0 flex-col border-l border-line">
      <ChatView
        key={pathname}
        scope={scope}
        header={<ChatContextBar scope={scope} changeable={false} />}
      />
    </aside>
  );
}

function ShellFooter({
  lesson,
  chat,
  sections,
}: {
  lesson: ChatTarget | null;
  chat: boolean;
  sections: readonly Section[];
}) {
  const { busyThreadId, unread } = useChat();
  const openChat = useOpenChat();
  if (lesson) {
    return (
      <TutorAskBar
        busy={busyThreadId !== null}
        unread={unread.size > 0}
        onOpen={() => openChat(lesson, { fromLesson: true })}
      />
    );
  }
  return (
    // Hidden while typing: a phone's keyboard fills the bottom of the screen.
    <AppTabBar
      className="pointer-coarse:group-has-[textarea:focus]/shell:hidden"
      tutorBusy={busyThreadId !== null && !chat}
      unread={unread.size > 0}
      sections={sections}
    />
  );
}

export default function DashboardLayout() {
  if (!useLearnerChosen()) return null;
  return (
    <LearnerProviders>
      <DashboardLayoutContent />
    </LearnerProviders>
  );
}
