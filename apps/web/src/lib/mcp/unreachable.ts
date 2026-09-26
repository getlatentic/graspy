/** As opposed to the server refusing. */
export function isUnreachable(error: unknown): boolean {
  return !navigator.onLine || error instanceof TypeError;
}
