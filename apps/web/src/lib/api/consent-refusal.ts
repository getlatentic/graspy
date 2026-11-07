// The server answers 403 consent_required to any call for a learner whose parent has not agreed to
// graspy teaching them (docs/API.md). Whoever holds the learner's pages listens, so that
// refusal from any call, a lesson, a tutor turn or a thread, ends in the parent's agreement.

export const CONSENT_REQUIRED = "consent_required";

type Listener = () => void;

const listeners = new Set<Listener>();

/** Calls `listener` whenever the server refuses the learner in use for want of a parent's
 * agreement. Returns the way to stop. */
export function onConsentRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function consentRequired(): void {
  for (const listener of [...listeners]) listener();
}

/** Announces a refusal that is the server's `consent_required`. Which learner it was for is not
 * said: a listener asks the server about the learner it holds. */
export function announceIfConsentRequired(status: number, code: unknown): void {
  if (status === 403 && code === CONSENT_REQUIRED) consentRequired();
}
