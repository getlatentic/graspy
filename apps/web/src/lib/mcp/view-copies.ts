import type { UiView } from "./server";

// Each view's page, kept so it opens after a reload without a connection. The page is small: its
// scripts, styles and fonts are its build's files, which its sandbox's worker keeps.
const PREFIX = "graspy.view.";
const keyOf = (uri: string) => `${PREFIX}${uri}`;

const isView = (value: unknown): value is UiView =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as UiView).html === "string" &&
  typeof (value as UiView).sandbox === "string";

function read(key: string): UiView | null {
  try {
    const kept: unknown = JSON.parse(
      window.localStorage.getItem(key) ?? "null",
    );
    return isView(kept) ? kept : null;
  } catch {
    return null;
  }
}

/** Keeps a view's page, to open without a connection. */
export function keepView(uri: string, view: UiView): void {
  try {
    window.localStorage.setItem(keyOf(uri), JSON.stringify(view));
  } catch {
    // Storage refused: the view opens only with a connection.
  }
}

/** The page kept for a view; none for a copy kept before pages named their sandbox. */
export function keptView(uri: string): UiView | null {
  return read(keyOf(uri));
}

/** The sandboxes the pages kept open in, whose workers hold their files. */
export function keptSandboxes(): Set<string> {
  const sandboxes = new Set<string>();
  try {
    const { localStorage } = window;
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      const kept = key?.startsWith(PREFIX) ? read(key) : null;
      if (kept) sandboxes.add(kept.sandbox);
    }
  } catch {
    // Storage refused: nothing is kept.
  }
  return sandboxes;
}
