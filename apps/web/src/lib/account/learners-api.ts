import { toApiError, toNetworkError } from "@/lib/api/errors";
import { fetchWithSession, type Issued } from "@/lib/api/session";
import { API_BASE_URL } from "@/lib/env";

// The account's learners (app/api/account_routes.py). Any signed-in session manages them.

export interface AccountLearner {
  id: string;
  name: string;
  createdAt: number;
}

interface Listed {
  learners: AccountLearner[];
}

const ACCOUNT_URL = `${API_BASE_URL}/account`;
const LEARNERS_URL = `${ACCOUNT_URL}/learners`;

async function call<T>(
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

export async function listLearners(): Promise<AccountLearner[]> {
  return (await call<Listed>(LEARNERS_URL, "GET")).learners;
}

/** Whoever adds a learner confirms they are that learner, or their parent or guardian. */
export function addLearner(name: string): Promise<AccountLearner> {
  return call(LEARNERS_URL, "POST", { name, guardian: true });
}

export function renameLearner(
  id: string,
  name: string,
): Promise<AccountLearner> {
  return call(`${LEARNERS_URL}/${id}`, "PATCH", { name });
}

/** Their plan, progress, lessons and conversations go with them. */
export async function removeLearner(id: string): Promise<AccountLearner[]> {
  return (await call<Listed>(`${LEARNERS_URL}/${id}`, "DELETE")).learners;
}

/** A session for the learner. With the device's id, its own record joins theirs, once. */
export function learnerSession(id: string, device?: string): Promise<Issued> {
  const body = device ? { deviceId: device } : {};
  return call(`${LEARNERS_URL}/${id}/session`, "POST", body);
}

/** Every learner and everything kept for them. The Google account stays Google's. */
export function deleteAccount(): Promise<void> {
  return call(ACCOUNT_URL, "DELETE");
}

/** The server's code for a refusal, such as too_many_learners. */
export function refusalCode(error: unknown): string | null {
  const data = (error as { data?: { detail?: { code?: unknown } } } | null)
    ?.data;
  const code = data?.detail?.code;
  return typeof code === "string" ? code : null;
}
