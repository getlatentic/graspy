// Gateway and rate-limit blips; 0 is a fetch that rejected (offline, DNS, CORS).
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

export function toNetworkError(cause: unknown): ApiError {
  return new ApiError(
    cause instanceof Error ? cause.message : "Network request failed",
    0,
  );
}
