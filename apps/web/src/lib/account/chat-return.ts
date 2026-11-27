import { ASK_HUB, TRY_CHAT } from "@/features/learn/lib/chat-targets";

// The chat or lesson a visitor was in before signing in, kept for this tab until they arrive. It
// outlives the sign-in popup and the "Who's learning?" step, and it is short-lived so that a
// sign-in made later, for another reason, does not open a chat.
const KEY = "graspy.chat-return";
const KEPT_MS = 30 * 60_000;

// A lesson of the learner's plan, which has the chat beside it.
const LESSON = /^\/app\/learn\/[^/]+\/lesson\/\d{1,3}$/;

/** The path itself when it is a chat or a lesson, else null: nothing else may be returned to. */
export function chatPathOf(path: string): string | null {
  const [pathOnly] = path.split(/[?#]/);
  const inChat =
    pathOnly === TRY_CHAT ||
    pathOnly === ASK_HUB ||
    pathOnly.startsWith(`${ASK_HUB}/`) ||
    LESSON.test(pathOnly);
  return inChat && !pathOnly.includes("//") && !pathOnly.includes("..")
    ? path
    : null;
}

export function rememberChat(path: string, now = Date.now()): void {
  const chat = chatPathOf(path);
  if (!chat) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ path: chat, at: now }));
  } catch {
    // Storage refused: the visitor signs in and starts from Home.
  }
}

/** The chat remembered, once: nothing after it is taken. */
export function takeChat(now = Date.now()): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    const kept = raw
      ? (JSON.parse(raw) as { path?: unknown; at?: unknown })
      : null;
    if (typeof kept?.path !== "string" || typeof kept.at !== "number") {
      return null;
    }
    return now - kept.at <= KEPT_MS ? chatPathOf(kept.path) : null;
  } catch {
    return null;
  }
}
