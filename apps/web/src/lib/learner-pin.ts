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

/** Pins work to the learner `current` names now. */
export function pinTo<K>(current: () => K): LearnerPin<K> {
  const learner = current();
  const holds = () => current() === learner;
  const hold = () => {
    if (!holds()) throw new LearnerChanged();
  };
  return { learner, holds, hold };
}
