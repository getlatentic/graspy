import { MessageCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { UnreadDot } from "@/features/learn/components/unread-dot";

interface TutorAskBarProps {
  busy: boolean;
  unread: boolean;
  onOpen: () => void;
}

/** On a phone, tabs would compete with the lesson's own controls. */
export function TutorAskBar({ busy, unread, onOpen }: TutorAskBarProps) {
  const { t } = useI18n();

  return (
    <div className="border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="relative flex w-full items-center gap-3 rounded-control border border-line bg-canvas px-4 py-3 text-start text-base text-muted hover:border-accent"
      >
        {busy ? (
          <Spinner />
        ) : (
          <MessageCircle
            className="size-5 shrink-0 text-accent-ink"
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1 truncate">{t("chat.openTutor")}</span>
        {unread && <UnreadDot className="size-2.5 shrink-0" />}
      </button>
    </div>
  );
}
