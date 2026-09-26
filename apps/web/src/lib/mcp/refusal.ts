import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/client";

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

/** The server's final word on this very call, as opposed to anything temporary or about the
 * session: those pass, or not, on a later try. */
export function refusesTheCall(error: unknown): boolean {
  return (
    error instanceof NotForViews ||
    (error instanceof ProtocolError && ABOUT_THE_CALL.has(error.code))
  );
}
