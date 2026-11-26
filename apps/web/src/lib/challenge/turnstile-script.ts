// Cloudflare's Turnstile script, loaded when a visitor's session is first wanted and never before.
// Everything else works against the small interface below, so a test hands in its own widget.

export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface WidgetOptions {
  sitekey: string;
  action: string;
  // Hidden unless the visitor has something to do: managed mode decides, `interaction-only` shows
  // the widget only for a challenge that needs them.
  appearance: "interaction-only";
  retry: "never";
  "refresh-expired": "never";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "unsupported-callback": () => void;
  "before-interactive-callback": () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: WidgetOptions): string | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function inject(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile did not start"));
    script.onerror = () => reject(new Error("Turnstile did not load"));
    document.head.appendChild(script);
  });
}

/** The widget API, loading the script on the first call. A failed load is tried again on the next. */
export function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= inject().catch((cause: unknown) => {
    loading = null;
    document
      .querySelectorAll(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
      .forEach((script) => script.remove());
    throw cause;
  });
  return loading;
}
