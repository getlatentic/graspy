import { API_BASE_URL } from "@/lib/env";

// Each build of the views has its sandbox on the server's origin, never the app's: a proxy the app
// frames, whose worker keeps the build's files so a view of that build opens without a connection.
const API_ORIGIN = new URL(API_BASE_URL).origin;
const PROXY_READY = "ui/notifications/sandbox-proxy-ready";
const KEEP = "graspy/sandbox-keep";
const KEPT = "graspy/sandbox-kept";
// Keeping is a download of every script, style and font of a build: minutes on a slow connection.
const KEEP_WITHIN_MS = 180_000;

/** The sandbox proxy at `sandbox`, a path on the server, framed by this app. */
export function sandboxAddress(sandbox: string): string {
  const address = new URL(sandbox, API_ORIGIN);
  address.searchParams.set("host", window.location.origin);
  return address.href;
}

/**
 * Whether the worker of `sandbox` holds every file of its build, asked in a frame no one sees.
 * `needed` names the sandboxes kept pages still open in; the rest are dropped.
 */
export async function keepSandbox(
  sandbox: string,
  needed: Iterable<string>,
): Promise<boolean> {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  const done = new AbortController();
  const kept = new Promise<boolean>((resolve) => {
    const gaveUp = setTimeout(() => resolve(false), KEEP_WITHIN_MS);
    done.signal.addEventListener("abort", () => clearTimeout(gaveUp));
    const heard = ({ source, origin, data }: MessageEvent) => {
      const proxy = frame.contentWindow;
      if (!proxy || source !== proxy || origin !== API_ORIGIN) return;
      if (data?.method === PROXY_READY) {
        const params = { sandboxes: [...needed] };
        proxy.postMessage({ jsonrpc: "2.0", method: KEEP, params }, API_ORIGIN);
      } else if (data?.method === KEPT) {
        resolve(data.params?.kept === true);
      }
    };
    window.addEventListener("message", heard, { signal: done.signal });
  });
  frame.src = sandboxAddress(sandbox);
  document.body.append(frame);
  try {
    return await kept;
  } finally {
    done.abort();
    frame.remove();
  }
}
