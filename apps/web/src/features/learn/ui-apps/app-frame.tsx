import { useEffect, useRef, useState, type RefObject } from "react";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { useI18n } from "@/lib/i18n-context";
import { uiView } from "@/lib/mcp/server";
import {
  bridgeTo,
  closeView,
  showView,
  VIEW_MAX_HEIGHT,
  type ViewHost,
} from "./view-bridge";

// A view that has not shown by then is not coming.
const SHOW_WITHIN_MS = 20_000;

interface AppFrameProps {
  card: TutorCard;
  host: ViewHost;
}

/** A tool's result as its MCP Apps view, sandboxed on the server's origin. */
export function AppFrame({ card, host }: AppFrameProps) {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const title = useViewTitle(card.resourceUri);
  const failed = useShownView(frame, card, host);

  if (failed) {
    return (
      <p role="alert" className="text-sm text-muted">
        {t("chat.viewUnavailable")}
      </p>
    );
  }
  // A browser gives no animation frame to a cross-origin frame with no area,
  // and the view measures itself in one: h-48 until it reports its height.
  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-scripts allow-same-origin allow-forms"
      className="block h-48 w-full border-0"
    />
  );
}

function useViewTitle(resourceUri: string): string {
  const [title, setTitle] = useState("");
  useEffect(() => {
    let live = true;
    uiView(resourceUri).then(
      (view) => live && setTitle(view.title),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [resourceUri]);
  return title;
}

/** True once the view has failed to show. */
function useShownView(
  frame: RefObject<HTMLIFrameElement | null>,
  card: TutorCard,
  host: ViewHost,
): boolean {
  const { locale } = useI18n();
  const latest = useRef({ card, host });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    latest.current = { card, host };
  });
  const { resourceUri } = card;

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const leaving = new AbortController();
    const bridge = bridgeTo(element, () => latest.current.host, {
      theme: "light",
      platform: "web",
      locale,
      displayMode: "inline",
      availableDisplayModes: ["inline"],
      containerDimensions: { maxHeight: VIEW_MAX_HEIGHT },
    });
    const signal = AbortSignal.any([
      leaving.signal,
      AbortSignal.timeout(SHOW_WITHIN_MS),
    ]);
    showView(element, bridge, latest.current.card, signal).catch(
      (error: unknown) => {
        if (leaving.signal.aborted) return;
        console.error("A view could not be shown:", error);
        setFailed(true);
      },
    );
    return () => {
      leaving.abort();
      void closeView(bridge);
    };
  }, [frame, resourceUri, locale]);

  return failed;
}
