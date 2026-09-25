import { ApiError, toApiError, toNetworkError } from "./errors";
import { fetchWithSession } from "./session";

const RETRY_DELAYS_MS = [400, 1200];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries transient failures, which is only safe for reads.
export async function getJson<T>(url: string): Promise<T> {
  let lastError: ApiError | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await wait(RETRY_DELAYS_MS[attempt - 1]);
    }

    let response: Response;
    try {
      response = await fetchWithSession(url);
    } catch (cause) {
      lastError = toNetworkError(cause);
      continue;
    }

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    lastError = await toApiError(response);
    if (!lastError.retryable) {
      throw lastError;
    }
  }

  throw lastError ?? new ApiError("Request failed", 0);
}
