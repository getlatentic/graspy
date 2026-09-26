import { ApiError, UNREADABLE_ANSWER } from "@/lib/api/errors";

// JSON-RPC and A2A codes about the request itself, as the HTTP status that says so: sent again,
// it would be refused again. Any other code (-32603 internal, -32000 to -32099 server errors,
// -32006 invalid agent response) is the tutor failing, which a later try may pass.
const ABOUT_THE_REQUEST = new Map<number, number>([
  [-32700, 400],
  [-32600, 400],
  [-32601, 404],
  [-32602, 400],
  [-32001, 404],
  [-32002, 409],
  [-32003, 400],
  [-32004, 400],
  [-32005, 415],
  [-32007, 404],
  [-32008, 400],
  [-32009, 400],
]);

// The SDK's own errors for those codes, by the names it gives them. It folds -32603 into
// RequestMalformedError along with the request's errors, so that one stays the tutor's.
const CODE_OF_SDK_ERROR = new Map<string, number>([
  ["TaskNotFoundError", -32001],
  ["TaskNotCancelableError", -32002],
  ["PushNotificationNotSupportedError", -32003],
  ["UnsupportedOperationError", -32004],
  ["ContentTypeNotSupportedError", -32005],
  ["ExtendedAgentCardNotConfiguredError", -32007],
  ["ExtensionSupportRequiredError", -32008],
  ["VersionNotSupportedError", -32009],
]);

export function rpcFailure(code: number, message: string): ApiError {
  return new ApiError(
    message,
    ABOUT_THE_REQUEST.get(code) ?? UNREADABLE_ANSWER,
  );
}

interface RpcErrorBody {
  jsonrpc?: unknown;
  error?: { code?: unknown; message?: unknown };
}

/** The JSON-RPC error a JSON body carries, or null. */
export function rpcFailureIn(body: unknown): ApiError | null {
  const { jsonrpc, error } = (body ?? {}) as RpcErrorBody;
  if (!jsonrpc || typeof error?.code !== "number") return null;
  return rpcFailure(error.code, String(error.message ?? "JSON-RPC error"));
}

/** An error the SDK threw for a tutor answer: a JSON-RPC error, or one it could not read. An
 * error inside the stream comes wrapped, the SDK's own error as its cause. */
export function sdkFailure(error: Error): ApiError {
  const source = error.cause instanceof Error ? error.cause : error;
  const code = CODE_OF_SDK_ERROR.get(source.name);
  if (code !== undefined) return rpcFailure(code, error.message);
  const transport = (source as { errorResponse?: unknown }).errorResponse;
  return (
    rpcFailureIn(transport) ?? new ApiError(error.message, UNREADABLE_ANSWER)
  );
}
