import { callAppTool } from "@/lib/mcp/server";
import type { ClassDetails } from "@/lib/voice/voice-learner";

// Whether the learner learns by voice alone, with no slide subjects: the server decides
// (app/learner/route.py) and the app keeps its last answer, per class, for offline.

const KEPT_PREFIX = "graspy.route.";

const listeners = new Set<() => void>();
const asked = new Map<string, Promise<boolean | null>>();

export const routeKey = ({ system, level, gradeLevel }: ClassDetails) =>
  `${system ?? ""}|${level ?? ""}|${gradeLevel ?? ""}`;

export function onRouteKept(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The answer last kept for the class; null before any. */
export function keptRoute(details: ClassDetails): boolean | null {
  try {
    const kept = window.localStorage.getItem(KEPT_PREFIX + routeKey(details));
    return kept === null ? null : kept === "voice";
  } catch {
    return null;
  }
}

export function keepRoute(details: ClassDetails, voiceOnly: boolean): void {
  try {
    window.localStorage.setItem(
      KEPT_PREFIX + routeKey(details),
      voiceOnly ? "voice" : "slides",
    );
  } catch {
    // Storage refused: the server is asked again next time.
  }
  for (const listener of listeners) listener();
}

/** Null when the server gave no answer. */
async function askServer(details: ClassDetails): Promise<boolean | null> {
  try {
    const result = await callAppTool("learner_route", {
      system: details.system || undefined,
      level: details.level || undefined,
      gradeLevel: details.gradeLevel || undefined,
    });
    const answer = (result.structuredContent as { voiceOnly?: unknown })
      ?.voiceOnly;
    if (result.isError || typeof answer !== "boolean") return null;
    keepRoute(details, answer);
    return answer;
  } catch (error) {
    console.warn("Asking the learner's route failed:", error);
    return null;
  }
}

/** The server's answer, asked once a visit per class; without one, the answer kept. */
export async function askRoute(details: ClassDetails): Promise<boolean | null> {
  const key = routeKey(details);
  let asking = asked.get(key);
  if (!asking) {
    asking = askServer(details);
    asked.set(key, asking);
  }
  const answer = await asking;
  if (answer !== null) return answer;
  asked.delete(key);
  return keptRoute(details);
}
