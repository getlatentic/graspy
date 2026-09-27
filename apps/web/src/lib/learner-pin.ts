import {
  currentAccount,
  holderOf,
  learnerTurn,
} from "@/lib/account/account-store";

// Work started for one learner stays theirs. Once the device learns as someone else, it sends
// nothing more and writes nothing more on the device, which now holds the next learner.

/** The device learns as someone else now than the learner the work was started for. */
export class LearnerChanged extends Error {
  constructor() {
    super("The session is no longer the one this was made for");
    this.name = "LearnerChanged";
  }
}

export interface LearnerPin<K> {
  /** Whom the work was started for. */
  readonly learner: K;
  /** Whether the device still learns as them. */
  readonly holds: () => boolean;
  /** Stops the work, with LearnerChanged, once the device learns as someone else. */
  readonly hold: () => void;
}

/** Pins work to `learner` for the turn the device learns as them now. */
export function pinTo<K>(learner: K, turn: () => number): LearnerPin<K> {
  const began = turn();
  const holds = () => turn() === began;
  const hold = () => {
    if (!holds()) throw new LearnerChanged();
  };
  return { learner, holds, hold };
}

/** Pins work to whoever the device learns as now. */
export const pinLearner = (): LearnerPin<string> =>
  pinTo(holderOf(currentAccount()), learnerTurn);
