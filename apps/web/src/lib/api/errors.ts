// Gateway and rate-limit blips; 0 is a NetworkError, an answer that never arrived.
const RETRYABLE_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

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
    return RETRYABLE_STATUSES.has(this.status);
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

/** No answer reached the device (offline, DNS, CORS, a stream cut short), as opposed to one
 * graspy or Google gave. The only ApiError with status 0. */
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
