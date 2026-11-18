import { ApiError } from "./errors";

// 504 is one of the statuses a later try may pass.
const GATEWAY_TIMEOUT = 504;

/** Gives each wait in a stream a time limit. Any bytes that arrive, a heartbeat included, end a
 * wait, and the next one starts afresh. With no limit it waits as long as the work does. */
export class IdleLimit {
  readonly signal: AbortSignal | undefined;
  private readonly ms: number | undefined;
  private readonly controller: AbortController | undefined;

  constructor(ms: number | undefined) {
    this.ms = ms;
    this.controller = ms === undefined ? undefined : new AbortController();
    this.signal = this.controller?.signal;
  }

  async within<T>(work: Promise<T>): Promise<T> {
    const ms = this.ms;
    if (ms === undefined) return work;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const quiet = new Promise<never>((_, reject) => {
      const arm = () => {
        timer = setTimeout(() => {
          // A page in the background is not told of bytes that came meanwhile: wait on for the learner.
          if (typeof document !== "undefined" && document.hidden) return arm();
          this.controller?.abort();
          reject(
            new ApiError(
              `Nothing arrived for ${Math.round(ms / 1000)} seconds`,
              GATEWAY_TIMEOUT,
            ),
          );
        }, ms);
      };
      arm();
    });
    try {
      return await Promise.race([work, quiet]);
    } finally {
      clearTimeout(timer);
    }
  }
}
