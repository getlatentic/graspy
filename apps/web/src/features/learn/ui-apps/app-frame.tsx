import { useEffect, useRef, useState, type RefObject } from "react";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useI18n } from "@/lib/i18n-context";
import { abortAny } from "@/lib/abort-any";
import { uiView } from "@/lib/mcp/server";
import type { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import {
  bridgeTo,
  closeView,
  hostContextFor,
  showView,
  tellHostContext,
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

/** True once the view has failed to show. The view's colours follow the page's scheme, also while it is open. */
function useShownView(
  frame: RefObject<HTMLIFrameElement | null>,
  card: TutorCard,
  host: ViewHost,
): boolean {
  const { locale } = useI18n();
  const theme = useColorScheme();
  const latest = useRef({ card, host, theme });
  const open = useRef<AppBridge | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    latest.current = { card, host, theme };
  });
  const { resourceUri } = card;

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const leaving = new AbortController();
    const bridge = bridgeTo(
      element,
      () => latest.current.host,
      hostContextFor(locale, latest.current.theme),
    );
    const signal = abortAny([
      leaving.signal,
      AbortSignal.timeout(SHOW_WITHIN_MS),
    ]);
    showView(element, bridge, latest.current.card, signal).then(
      () => {
        if (leaving.signal.aborted) return;
        open.current = bridge;
        // A change of scheme during the handshake is told now.
        tellHostContext(bridge, { theme: latest.current.theme });
      },
      (error: unknown) => {
        if (leaving.signal.aborted) return;
        console.error("A view could not be shown:", error);
        setFailed(true);
      },
    );
    return () => {
      open.current = null;
      leaving.abort();
      void closeView(bridge);
    };
  }, [frame, resourceUri, locale]);

  useEffect(() => {
    if (open.current) tellHostContext(open.current, { theme });
  }, [theme]);

  return failed;
}
