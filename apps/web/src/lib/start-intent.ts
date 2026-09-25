// A landing-page choice waits here, for the tab's lifetime, until the learner has a plan.
export type AskIdea = "explain" | "practise" | "plan";

export interface StartIntent {
  subject?: string;
  ask?: AskIdea;
}

const KEY = "graspy.start-intent";

export function rememberStart(intent: StartIntent): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Refused, as in private browsing: setup runs without the choice.
  }
}

export function readStart(): StartIntent | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StartIntent) : null;
  } catch {
    return null;
  }
}

export function clearStart(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
