import { ApiError, UNREADABLE_ANSWER, toNetworkError } from "./errors";

/** A body the connection cut while it was read is a NetworkError; one read whole that is not
 * JSON is an answer the app cannot read. */
export async function readJson<T>(response: Response): Promise<T> {
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    throw toNetworkError(cause);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("The answer is not JSON", UNREADABLE_ANSWER);
  }
}
