/** Storage slower than this is given up on: the lesson goes on without its answer. */
const STORAGE_MS = 3_000;

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** What the device's storage does, or a failure once it has not answered in time. */
export function inTime<T>(
  work: Promise<T>,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<T> {
  const tooSlow = pause(STORAGE_MS).then(() => {
    throw new Error("The device's storage did not answer");
  });
  return Promise.race([work, tooSlow]);
}
