import { useEffect, useRef, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
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
 * strip with the button that opens it. Folded, it stays mounted so a half-written question and a
 * reply on the way are still there when it opens. */
export function ChatPane({
  open,
  width,
  onOpen,
  onResize,
  children,
}: ChatPaneProps) {
  const { t } = useI18n();
  const pane = useRef<HTMLElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  // The button the learner pressed is gone, so focus goes to the one that undoes it.
  useEffect(() => {
    if (!toggled.current) return;
    if (open)
      pane.current?.querySelector<HTMLElement>("[data-hide-chat]")?.focus();
    else openButton.current?.focus();
  }, [open]);

  return (
    <aside
      ref={pane}
      style={open ? { width } : undefined}
      onClickCapture={() => {
        toggled.current = true;
      }}
      className={cn(
        "relative flex shrink-0 flex-col border-s border-line",
        open ? "max-w-1/2" : "w-14 items-center bg-surface pt-3",
      )}
    >
      {!open && (
        <button
          ref={openButton}
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
      )}
      {open && (
        <PaneResizer
          width={width}
          measure={() => pane.current?.offsetWidth || width}
          onDrag={(next) => {
            if (pane.current) pane.current.style.width = `${next}px`;
          }}
          onCommit={onResize}
        />
      )}
      <div
        hidden={!open}
        inert={!open}
        className="flex min-h-0 w-full flex-1 flex-col"
      >
        {children}
      </div>
    </aside>
  );
}

export function HideChatButton({ onHide }: { onHide: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-hide-chat=""
      onClick={onHide}
      aria-label={t("chat.hide")}
      title={t("chat.hide")}
      className={BUTTON}
    >
      <PanelRightClose className="size-5 rtl:-scale-x-100" aria-hidden="true" />
    </button>
  );
}
