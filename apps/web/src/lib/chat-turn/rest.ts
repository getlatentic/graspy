import { API_BASE_URL } from "@/lib/env";
import { ApiError, toApiError, toNetworkError } from "@/lib/api/errors";
import { fetchWithSession } from "@/lib/api/session";

/** The server keeps no turns (it is not running them in the background), so the page asks the tutor
 * the way it used to. */
export class TurnsUnavailable extends Error {
  constructor() {
    super("This server keeps no turns");
    this.name = "TurnsUnavailable";
  }
}

const RETRY_DELAYS_MS = [300, 900, 2_700];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const chatUrl = (chat: string) =>
  `${API_BASE_URL}/chats/${encodeURIComponent(chat)}`;

async function post(url: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetchWithSession(url, {
      method: "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch (cause) {
    throw toNetworkError(cause);
  }
  if (response.ok) return response;
  throw await toApiError(response);
}

function codeOf(error: ApiError): unknown {
  const data = error.data as { detail?: { code?: unknown } } | undefined;
  return data?.detail?.code;
}

export interface StartedTurn {
  turn: string;
  /** The seq to read the turn's frames after. */
  cursor: number;
}

export interface TurnStart {
  parts: unknown[];
  metadata: Record<string, unknown>;
}

/** Begins the turn `turn` of `chat`. Sent again, the same turn id joins the turn it began, so a start
 * whose answer was lost is sent again. */
export async function startTurn(
  chat: string,
  turn: string,
  { parts, metadata }: TurnStart,
): Promise<StartedTurn> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await post(`${chatUrl(chat)}/turns`, {
        turn,
        parts,
        metadata,
      });
      return (await response.json()) as StartedTurn;
    } catch (error) {
      if (error instanceof ApiError && codeOf(error) === "turns_unavailable") {
        throw new TurnsUnavailable();
      }
      const again =
        error instanceof ApiError &&
        error.retryable &&
        attempt < RETRY_DELAYS_MS.length;
      if (!again) throw error;
    }
    await wait(RETRY_DELAYS_MS[attempt]);
  }
}

/** Asks the server to end the turn with the words it has. */
export async function stopTurn(chat: string, turn: string): Promise<void> {
  await post(`${chatUrl(chat)}/turns/${encodeURIComponent(turn)}/stop`);
}
