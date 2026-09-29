import { toApiError, toNetworkError } from "@/lib/api/errors";
import { fetchWithSession } from "@/lib/api/session";
import { API_BASE_URL } from "@/lib/env";

export const ACCOUNT_URL = `${API_BASE_URL}/account`;

/** A call to the account's routes under the session in use. */
export async function call<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithSession(url, {
      method,
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
  if (!response.ok) throw await toApiError(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** The server's code for a refusal, such as too_many_learners. */
export function refusalCode(error: unknown): string | null {
  const data = (error as { data?: { detail?: { code?: unknown } } } | null)
    ?.data;
  const code = data?.detail?.code;
  return typeof code === "string" ? code : null;
}
