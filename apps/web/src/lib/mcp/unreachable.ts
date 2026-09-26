import { SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { ApiError, NetworkError } from "@/lib/api/errors";

// The MCP client gives up on a request nothing answered with a RequestTimeout.
const timedOut = (error: unknown) =>
  error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout;

// graspy's session exchange could not reach Google to check the sign-in (503).
function googleUnchecked(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const body = error.data as { detail?: { code?: unknown } } | undefined;
  return body?.detail?.code === "sign_in_unchecked";
}

/** As opposed to the server, or Google for the session, refusing. */
export function isUnreachable(error: unknown): boolean {
  return (
    !navigator.onLine ||
    error instanceof TypeError ||
    error instanceof NetworkError ||
    timedOut(error) ||
    googleUnchecked(error)
  );
}
