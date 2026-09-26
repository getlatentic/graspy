import { NetworkError } from "@/lib/api/errors";

/** As opposed to the server, or Google for the session, refusing. */
export function isUnreachable(error: unknown): boolean {
  return (
    !navigator.onLine ||
    error instanceof TypeError ||
    error instanceof NetworkError
  );
}
