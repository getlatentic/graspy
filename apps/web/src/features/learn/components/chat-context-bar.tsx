import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, X } from "lucide-react";
import type { ThreadScope } from "@/lib/chat-db";
import { useDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/lib/i18n-context";
import { useUserProfile } from "@/lib/use-user-profile";
import { chatPath } from "@/features/learn/lib/chat-targets";
import { levelLabel } from "@/lib/learner-level";
import { ScopeIcon } from "@/features/learn/components/thread-row";
import {
  describeScope,
  scopeDetail,
} from "@/features/learn/lib/describe-scope";
import { ChatDirectory } from "@/features/learn/components/chat-directory";
import { usePlan } from "../learner-context";

interface ChatContextBarProps {
  scope: ThreadScope;
  /** False beside a lesson, where the conversation is that lesson's. */
  changeable: boolean;
  onBackToLesson?: () => void;
}

export function ChatContextBar({
  scope,
  changeable,
  onBackToLesson,
}: ChatContextBarProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { curriculum } = usePlan();
  const [choosing, setChoosing] = useState(false);
  const { title, subject } = describeScope(scope, curriculum, t);
  const profile = useUserProfile();
  const grade = profile ? levelLabel(profile, t) : null;
  const detail = scopeDetail(scope, subject, grade, t);

  return (
    <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
      {onBackToLesson && <BackToLesson onBack={onBackToLesson} />}
      <ScopeIcon kind={scope.kind} subject={subject} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <p className="truncate text-xs text-muted">{detail}</p>
      </div>
      {changeable && (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("ask.change")}
        </button>
      )}
      {choosing && (
        <TopicSheet
          current={scope}
          onClose={() => setChoosing(false)}
          onPick={(target) => {
            setChoosing(false);
            navigate(chatPath(target));
          }}
        />
      )}
    </div>
  );
}

function BackToLesson({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={t("chat.backToLesson")}
      title={t("chat.backToLesson")}
      className="-ms-2 shrink-0 rounded-full p-2 text-accent-ink transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
    </button>
  );
}

function TopicSheet({
  current,
  onClose,
  onPick,
}: {
  current: ThreadScope;
  onClose: () => void;
  onPick: Parameters<typeof ChatDirectory>[0]["onPick"];
}) {
  const { t } = useI18n();
  const sheetRef = useDialog<HTMLDivElement>(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("ask.changeTitle")}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-canvas shadow-2xl lg:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-sans text-base font-semibold text-ink">
            {t("ask.changeTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ask.close")}
            className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-accent-soft"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <ChatDirectory current={current} onPick={onPick} />
        </div>
      </div>
    </div>
  );
}
