import { SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { NetworkError, SignInUnchecked } from "@/lib/api/errors";

// The MCP client gives up on a request nothing answered with a RequestTimeout.
const timedOut = (error: unknown) =>
  error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout;

/** As opposed to the server, or Google for the session, refusing. */
export function isUnreachable(error: unknown): boolean {
  // fetch rejects with a TypeError that each browser words differently, so any TypeError counts.
  return (
    !navigator.onLine ||
    error instanceof TypeError ||
    error instanceof NetworkError ||
    error instanceof SignInUnchecked ||
    timedOut(error)
  );
}
