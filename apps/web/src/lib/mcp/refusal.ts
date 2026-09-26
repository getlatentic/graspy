import {
  ProtocolError,
  ProtocolErrorCode,
  SdkHttpError,
} from "@modelcontextprotocol/client";
import { isRetryableStatus } from "@/lib/api/errors";

/** The server offers the tool to the model only, never to a view. */
export class NotForViews extends Error {
  constructor(name: string) {
    super(`${name} cannot be called from a view`);
    this.name = "NotForViews";
  }
}

// JSON-RPC errors about the call itself: sent again, it would be refused again.
const ABOUT_THE_CALL = new Set<number>([
  ProtocolErrorCode.InvalidRequest,
  ProtocolErrorCode.MethodNotFound,
  ProtocolErrorCode.InvalidParams,
]);

const ABOUT_THE_SESSION = new Set([401, 403]);

// A 4xx the SDK could not read as JSON-RPC, such as 413 for a body over the server's limit.
const refusedOverHttp = (error: unknown) =>
  error instanceof SdkHttpError &&
  error.status >= 400 &&
  error.status < 500 &&
  !isRetryableStatus(error.status) &&
  !ABOUT_THE_SESSION.has(error.status);

/** The server's final word on this very call, as opposed to anything temporary or about the
 * session: those pass, or not, on a later try. */
export function refusesTheCall(error: unknown): boolean {
  return (
    error instanceof NotForViews ||
    (error instanceof ProtocolError && ABOUT_THE_CALL.has(error.code)) ||
    refusedOverHttp(error)
  );
}
