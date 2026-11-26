import { useState } from "react";
import { BackLink } from "@/components/ui/back-link";
import { useLocation, useNavigate } from "react-router";
import {
  chatToReturnTo,
  lessonMadeInChat,
} from "@/features/learn/lib/lesson-opening";
import { useI18n } from "@/lib/i18n-context";
import { useLessonTopic } from "@/features/learn/hooks/use-lesson-topic";
import { useLessonCard } from "@/features/learn/hooks/use-lesson-card";
import { objectivesOf, openLesson } from "@/features/learn/lib/lesson-app";
import { lessonHost } from "@/features/learn/lib/lesson-host";
import { lessonProblem } from "@/features/learn/lib/lesson-problem";
import { LessonFinished } from "@/features/learn/components/lesson-finished";
import {
  LessonLoading,
  LessonProblemCard,
} from "@/features/learn/components/lesson-status";
import { AppFrame } from "@/features/learn/ui-apps/app-frame";
import { lessonPath, subjectPath } from "@/lib/learn-paths";
import { usePlan, useProgress } from "@/features/learn/learner-context";

type LessonTopic = ReturnType<typeof useLessonTopic>;

// The server's lesson view, framed as an MCP Apps host frames one.
export default function LessonPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const lesson = useLessonTopic();
  // Opened from a card in the chat: the way back to that chat, as it was left.
  const { state } = useLocation();
  const { backToChat } = chatToReturnTo(state);
  const back = () => navigate(subjectPath(lesson.slug));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav className="flex flex-wrap gap-x-6 gap-y-2">
        {backToChat && (
          <BackLink onClick={() => navigate(backToChat)}>
            {t("lesson.backToChat")}
          </BackLink>
        )}
        <BackLink onClick={back}>
          {t("lesson.backTo", { subject: lesson.subjectName })}
        </BackLink>
      </nav>
      <LessonBody
        lesson={lesson}
        onBack={back}
        madeInChat={lessonMadeInChat(state)}
      />
    </div>
  );
}

function LessonBody({
  lesson: { slug, subject, subjectName, target, next },
  onBack,
  madeInChat,
}: {
  lesson: LessonTopic;
  onBack: () => void;
  madeInChat: string | undefined;
}) {
  const navigate = useNavigate();
  const { isLoaded } = usePlan();
  const progress = useProgress();
  const { key, card, failure, retry } = useLessonCard(target, madeInChat);
  const [finished, setFinished] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);

  const problem = lessonProblem({
    loaded: isLoaded,
    hasSubject: subject !== null,
    hasTarget: target !== null,
    failure,
    online: navigator.onLine,
  });
  if (problem) {
    return (
      <LessonProblemCard problem={problem} onRetry={retry} onBack={onBack} />
    );
  }
  if (!card || !target) return <LessonLoading topic={target?.topic} />;
  if (finished === key) {
    return (
      <LessonFinished
        topic={target.topic}
        subject={subjectName}
        objectives={
          objectives.length > 0 ? objectives : objectivesOf(card.toolResult)
        }
        next={next?.topic ?? null}
        onNext={() => next && navigate(lessonPath(slug, next.index))}
        onBack={onBack}
      />
    );
  }
  const host = lessonHost({
    target,
    card,
    marks: progress,
    onFinish: () => {
      setFinished(key);
      // Made while the learner reads this, so it is ready when they go on.
      if (next?.target) void openLesson(next.target).catch(() => undefined);
    },
    onObjectives: setObjectives,
  });
  return <AppFrame card={card} host={host} />;
}
