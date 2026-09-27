import { readJson } from "./body";
import { ApiError, toApiError, toNetworkError } from "./errors";
import { LearnerChanged } from "@/lib/learner-pin";
import { fetchWithSession } from "./session";

const RETRY_DELAYS_MS = [400, 1200];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A request its learner no longer holds was not sent: it is not the network failing.
async function sent(
  url: string,
  init: RequestInit,
  still?: () => boolean,
): Promise<Response> {
  try {
    return await fetchWithSession(url, init, still);
  } catch (cause) {
    if (cause instanceof LearnerChanged) throw cause;
    throw toNetworkError(cause);
  }
}

async function answered<T>(
  url: string,
  init: RequestInit,
  still?: () => boolean,
): Promise<T> {
  const response = await sent(url, init, still);
  if (!response.ok) throw await toApiError(response);
  return readJson<T>(response);
}

/** Retries transient failures, which is only safe for reads. `still`, asked as each try is
 * sent, stops the tries once the session is no longer the one the read was made for. */
export async function getJson<T>(
  url: string,
  still?: () => boolean,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await answered<T>(url, {}, still);
    } catch (error) {
      const retryable = error instanceof ApiError && error.retryable;
      if (!retryable || attempt === RETRY_DELAYS_MS.length) throw error;
    }
    await wait(RETRY_DELAYS_MS[attempt]);
  }
}

/** One attempt: a write is not retried here. `still` as for getJson. */
export function sendJson<T>(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  still?: () => boolean,
): Promise<T> {
  const init = {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  return answered<T>(url, init, still);
}
