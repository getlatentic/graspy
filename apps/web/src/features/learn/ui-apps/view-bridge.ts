import type { CallToolResult } from "@modelcontextprotocol/client";
import {
  AppBridge,
  PostMessageTransport,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { callOrKeep } from "@/lib/mcp/outbox";
import { sandboxAddress } from "@/lib/mcp/sandbox";
import { HOST_INFO, uiView } from "@/lib/mcp/server";

export interface ViewHost {
  /** Defaults to the server, kept to send later while it cannot be reached. */
  callTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
  toolCalled: (
    name: string,
    args: Record<string, unknown>,
    result: CallToolResult,
  ) => void;
  /** The view's ui/message; false while another turn runs. */
  message: (text: string) => boolean;
}

export const VIEW_MAX_HEIGHT = 2000;
// A view that does not answer teardown is not waited for past this.
const TEARDOWN_MS = 500;
const PROXY_READY = "ui/notifications/sandbox-proxy-ready";

const textOf = (content: { type: string; text?: string }[]) =>
  content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");

/** `host` is read as each message arrives, so it can change. */
export function bridgeTo(
  frame: HTMLIFrameElement,
  host: () => ViewHost,
  context: McpUiHostContext,
): AppBridge {
  const bridge = new AppBridge(
    null,
    HOST_INFO,
    { openLinks: {}, serverTools: {}, logging: {} },
    { hostContext: context },
  );
  bridge.oncalltool = async ({ name, arguments: args = {} }) => {
    const call = host().callTool ?? callOrKeep;
    const result = await call(name, args);
    if (!result.isError) host().toolCalled(name, args, result);
    return result;
  };
  bridge.onmessage = async ({ content }) =>
    host().message(textOf(content)) ? {} : { isError: true };
  bridge.onopenlink = async ({ url }) => {
    if (/^https?:\/\//.test(url))
      window.open(url, "_blank", "noopener,noreferrer");
    return {};
  };
  bridge.onsizechange = ({ height }) => {
    if (height !== undefined) frame.style.height = `${Math.ceil(height)}px`;
  };
  bridge.onloggingmessage = (params) => console.info("[view]", params);
  return bridge;
}

function unlessAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    ),
  ]);
}

function proxyReady(frame: HTMLIFrameElement, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const heard = ({ source, data }: MessageEvent) => {
      if (source === frame.contentWindow && data?.method === PROXY_READY) {
        window.removeEventListener("message", heard);
        resolve();
      }
    };
    window.addEventListener("message", heard, { signal });
  });
}

/** MCP Apps' order: proxy frame, view document, then once initialised the
    tool's input and result. The view opens in its build's sandbox. */
export async function showView(
  frame: HTMLIFrameElement,
  bridge: AppBridge,
  card: TutorCard,
  signal: AbortSignal,
): Promise<void> {
  const view = await unlessAborted(uiView(card.resourceUri), signal);
  const ready = proxyReady(frame, signal);
  frame.src = sandboxAddress(view.sandbox);
  await unlessAborted(ready, signal);

  const initialized = new Promise<void>((resolve) => {
    bridge.oninitialized = () => resolve();
  });
  const proxy = frame.contentWindow!;
  await bridge.connect(new PostMessageTransport(proxy, proxy));
  await bridge.sendSandboxResourceReady(view);
  await unlessAborted(initialized, signal);
  await bridge.sendToolInput({ arguments: card.toolInput });
  await bridge.sendToolResult(card.toolResult);
}

export async function closeView(bridge: AppBridge): Promise<void> {
  await Promise.race([
    bridge.teardownResource({}).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, TEARDOWN_MS)),
  ]);
  await bridge.close();
}
