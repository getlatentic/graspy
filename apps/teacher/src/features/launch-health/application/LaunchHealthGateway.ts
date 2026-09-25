import type { LaunchFailure } from "../domain/launchHealth";

export interface LaunchHealthGateway {
  /** The failure that stopped this launch, or null when graspy opened cleanly. */
  check(): Promise<LaunchFailure | null>;
  /** Run the failed startup work again, reporting what failed this time. */
  retry(): Promise<LaunchFailure | null>;
}
