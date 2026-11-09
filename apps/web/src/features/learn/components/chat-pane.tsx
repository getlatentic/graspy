import { useRef, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { PaneResizer } from "@/features/learn/components/pane-resizer";

interface ChatPaneProps {
  open: boolean;
  /** In px. */
  width: number;
  onOpen: () => void;
  onResize: (width: number) => void;
  children: ReactNode;
}

const BUTTON =
  "shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-accent-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The lesson's conversation beside the lesson: as wide as the learner drags it, or folded to a
 * strip with the button that opens it. */
export function ChatPane({
  open,
  width,
  onOpen,
  onResize,
  children,
}: ChatPaneProps) {
  const { t } = useI18n();
  const pane = useRef<HTMLElement>(null);

  if (!open) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center border-s border-line bg-surface pt-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("chat.openTutor")}
          title={t("chat.openTutor")}
          className={BUTTON}
        >
          <PanelRightOpen
            className="size-5 rtl:-scale-x-100"
            aria-hidden="true"
          />
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={pane}
      style={{ width }}
      className="relative flex max-w-1/2 shrink-0 flex-col border-s border-line"
    >
      <PaneResizer
        width={width}
        onDrag={(next) => {
          if (pane.current) pane.current.style.width = `${next}px`;
        }}
        onCommit={onResize}
      />
      {children}
    </aside>
  );
}

export function HideChatButton({ onHide }: { onHide: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onHide}
      aria-label={t("chat.hide")}
      title={t("chat.hide")}
      className={BUTTON}
    >
      <PanelRightClose className="size-5 rtl:-scale-x-100" aria-hidden="true" />
    </button>
  );
}
