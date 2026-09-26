// Gateway and rate-limit blips, and 0: a NetworkError, no answer at all.
const RETRYABLE_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

/** Whether the same request may pass on a later try. */
export const isRetryableStatus = (status: number): boolean =>
  RETRYABLE_STATUSES.has(status);

/** An answer the app cannot read: no body, or not what the protocol promises. Taken as a
 * gateway's bad answer, which a later try may not repeat. */
export const UNREADABLE_ANSWER = 502;

export class ApiError extends Error {
  readonly status: number;
  readonly data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }

  get retryable(): boolean {
    return isRetryableStatus(this.status);
  }
}

// A gateway answers with HTML, not JSON, so the body's detail is optional.
export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const record = body as Record<string, unknown> | undefined;
  const detail = String(record?.error ?? record?.detail ?? "");
  return new ApiError(
    detail || `Request failed with status ${response.status}`,
    response.status,
    body,
  );
}

/** No answer from graspy or Google reached the device: a fetch rejected (offline, DNS, CORS),
 * the connection was cut while an answer was read, or Firebase could not reach Google. The
 * only ApiError with status 0. */
export class NetworkError extends ApiError {
  constructor(message: string) {
    super(message, 0);
    this.name = "NetworkError";
  }
}

// An ApiError is kept: fetchWithSession's session exchange has already told an answer
// from a failure to reach graspy or Google.
export function toNetworkError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  return new NetworkError(
    cause instanceof Error ? cause.message : "Network request failed",
  );
}
