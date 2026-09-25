import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

// pinned: the new question stays at the top while its answer grows below.
// follow: the newest text stays in view. free: the learner scrolled away.
type ScrollMode = "pinned" | "follow" | "free";

const NEAR_END_PX = 48;
// Previous reply left visible above a pinned question, for context.
const PEEK_PX = 48;

function nextMode(
  mode: ScrollMode,
  scroll: { movedUp: boolean; nearEnd: boolean },
): ScrollMode {
  if (scroll.nearEnd && !scroll.movedUp) return "follow";
  if (scroll.movedUp && !scroll.nearEnd) return "free";
  return mode;
}

/** Room a turn needs to sit at the top however short its answer. */
function reserveFor(list: HTMLElement): number {
  const paddingBottom = parseFloat(getComputedStyle(list).paddingBottom) || 0;
  return Math.max(0, list.clientHeight - PEEK_PX - paddingBottom);
}

interface ScrollState {
  mode: ScrollMode;
  lastTop: number;
  /** Our own scrolls must not change the mode. */
  ownScroll: boolean;
}

interface ScrollReports {
  atEnd: (atEnd: boolean) => void;
  reserve: (height: number) => void;
}

function trackList(
  list: HTMLElement,
  content: HTMLElement,
  state: ScrollState,
  report: ScrollReports,
): () => void {
  const distance = () => list.scrollHeight - list.scrollTop - list.clientHeight;
  const toEnd = () => {
    if (distance() <= 1) return;
    state.ownScroll = true;
    list.scrollTop = list.scrollHeight;
  };
  const scrolled = () => {
    const movedUp = list.scrollTop < state.lastTop - 1;
    state.lastTop = list.scrollTop;
    const nearEnd = distance() < NEAR_END_PX;
    report.atEnd(nearEnd);
    if (state.ownScroll) {
      state.ownScroll = false;
      return;
    }
    state.mode = nextMode(state.mode, { movedUp, nearEnd });
  };
  const grown = () => {
    if (state.mode === "follow") toEnd();
    report.atEnd(distance() < NEAR_END_PX);
  };
  let height = list.clientHeight;
  const resized = () => {
    // A hidden list missed every update, so it opens at the newest message.
    if (height === 0 && list.clientHeight > 0) state.mode = "follow";
    height = list.clientHeight;
    report.reserve(reserveFor(list));
    grown();
  };

  list.addEventListener("scroll", scrolled, { passive: true });
  const contentObserver = new ResizeObserver(grown);
  contentObserver.observe(content);
  const listObserver = new ResizeObserver(resized);
  listObserver.observe(list);
  report.reserve(reserveFor(list));
  toEnd();

  return () => {
    list.removeEventListener("scroll", scrolled);
    contentObserver.disconnect();
    listObserver.disconnect();
  };
}

export function useChatScroll(
  listRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const state = useRef<ScrollState>({
    mode: "follow",
    lastTop: 0,
    ownScroll: false,
  });
  const [atEnd, setAtEnd] = useState(true);
  const [reserve, setReserve] = useState(0);

  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) return;
    return trackList(list, content, state.current, {
      atEnd: setAtEnd,
      reserve: setReserve,
    });
  }, [listRef, contentRef]);

  // Measured before pinning: a just-shown list may not have reported its size.
  const measure = useCallback(() => {
    if (listRef.current) setReserve(reserveFor(listRef.current));
  }, [listRef]);

  const pin = useCallback(
    (turn: HTMLElement) => {
      const list = listRef.current;
      if (!list) return;
      state.current.mode = "pinned";
      const target = Math.max(0, turn.offsetTop - PEEK_PX);
      if (Math.abs(list.scrollTop - target) <= 1) return;
      state.current.ownScroll = true;
      list.scrollTop = target;
    },
    [listRef],
  );

  const jumpToEnd = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    state.current.mode = "follow";
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [listRef]);

  return { atEnd, reserve, measure, pin, jumpToEnd };
}
