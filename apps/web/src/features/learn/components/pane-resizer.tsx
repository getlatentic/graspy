import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useI18n } from "@/lib/i18n-context";
import {
  CHAT_WIDTH,
  clampChatWidth,
  widthAfterKey,
} from "@/features/learn/lib/pane-layout";

interface PaneResizerProps {
  /** The width the learner chose, in px. */
  width: number;
  /** The width the pane is drawn at now: the room the screen leaves it can be less than `width`. */
  measure: () => number;
  /** While dragging, so the pane follows the pointer without rendering its content again. */
  onDrag: (width: number) => void;
  onCommit: (width: number) => void;
}

interface Drag {
  pointerId: number;
  x: number;
  width: number;
  rtl: boolean;
}

const isRtl = (element: Element) =>
  getComputedStyle(element).direction === "rtl";

/** The divider on a pane's inline-start edge; dragging it left widens a pane on the right. */
export function PaneResizer({
  width,
  measure,
  onDrag,
  onCommit,
}: PaneResizerProps) {
  const { t } = useI18n();
  const drag = useRef<Drag | null>(null);
  const latest = useRef(0);

  const end = (commit: boolean) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    document.body.style.removeProperty("user-select");
    if (commit && latest.current !== start.width) onCommit(latest.current);
    else onDrag(start.width);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    const width = measure();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      width,
      rtl: isRtl(event.currentTarget),
    };
    latest.current = width;
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const moved = event.clientX - start.x;
    latest.current = clampChatWidth(start.width + (start.rtl ? moved : -moved));
    onDrag(latest.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const next = widthAfterKey(
      event.key,
      measure(),
      isRtl(event.currentTarget),
    );
    if (next === null) return;
    event.preventDefault();
    onCommit(next);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("chat.resize")}
      aria-valuemin={CHAT_WIDTH.min}
      aria-valuemax={CHAT_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) =>
        event.pointerId === drag.current?.pointerId && end(true)
      }
      onPointerCancel={() => end(false)}
      onLostPointerCapture={() => end(false)}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 start-0 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none pointer-coarse:w-4"
    >
      <span className="absolute inset-y-0 start-0 w-1 bg-transparent transition-colors group-hover:bg-accent/40 group-focus-visible:bg-accent group-active:bg-accent motion-reduce:transition-none" />
    </div>
  );
}
