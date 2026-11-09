import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useI18n } from "@/lib/i18n-context";
import {
  CHAT_WIDTH,
  clampChatWidth,
  widthAfterKey,
} from "@/features/learn/lib/pane-layout";

interface PaneResizerProps {
  /** The pane's width now, in px. */
  width: number;
  /** While dragging, so the pane follows the pointer without rendering its content again. */
  onDrag: (width: number) => void;
  onCommit: (width: number) => void;
}

const isRtl = (element: Element) =>
  getComputedStyle(element).direction === "rtl";

/** The divider on a pane's inline-start edge; dragging it left widens a pane on the right. */
export function PaneResizer({ width, onDrag, onCommit }: PaneResizerProps) {
  const { t } = useI18n();
  const drag = useRef<{ x: number; width: number; rtl: boolean } | null>(null);
  const latest = useRef(width);

  const widthAt = (event: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start) return null;
    const moved = event.clientX - start.x;
    return clampChatWidth(start.width + (start.rtl ? moved : -moved));
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      width,
      rtl: isRtl(event.currentTarget),
    };
    latest.current = width;
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const next = widthAt(event);
    if (next === null) return;
    latest.current = next;
    onDrag(next);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    onCommit(latest.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const next = widthAfterKey(event.key, width, isRtl(event.currentTarget));
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
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span className="absolute inset-y-0 start-0.5 w-1 bg-transparent transition-colors group-hover:bg-accent/40 group-focus-visible:bg-accent group-active:bg-accent motion-reduce:transition-none" />
    </div>
  );
}
