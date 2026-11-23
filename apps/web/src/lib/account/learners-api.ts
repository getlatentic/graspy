import { fetchAsParent, type Issued } from "@/lib/api/session";
import { ACCOUNT_URL, call } from "./account-call";

// The account's learners (app/api/account_routes.py). Any signed-in session manages them.

/** The parent's agreement to a notice. It is sent under the parent's session (the PIN, or a
 * Google sign-in just made), which is what shows it was them. */
export interface Agreement {
  noticeVersion: number;
}

export interface ServiceConsent {
  noticeVersion: number;
  grantedAt: number;
}

export interface VoiceConsent {
  noticeVersion: number;
  retentionDays: number;
}

export interface AccountLearner {
  id: string;
  name: string;
  createdAt: number;
  /** Null until a parent agreed to graspy teaching them. */
  serviceConsent: ServiceConsent | null;
  /** Null until a parent agreed to keep their voice recordings. */
  voiceConsent: VoiceConsent | null;
}

/** What a rename answers: the learner without their consents. */
export type RenamedLearner = Pick<AccountLearner, "id" | "name" | "createdAt">;

interface Listed {
  learners: AccountLearner[];
}

const LEARNERS_URL = `${ACCOUNT_URL}/learners`;

export async function listLearners(): Promise<AccountLearner[]> {
  return (await call<Listed>(LEARNERS_URL, "GET")).learners;
}

/** Whoever adds a learner is that learner, or their parent or guardian, and agrees for them. */
export function addLearner(
  name: string,
  consent: Agreement,
): Promise<AccountLearner> {
  return call(
    LEARNERS_URL,
    "POST",
    { name, guardian: true, consent },
    fetchAsParent,
  );
}

/** For a learner who was added without the parent's agreement. */
export function agreeToService(
  id: string,
  consent: Agreement,
): Promise<ServiceConsent> {
  return call(`${LEARNERS_URL}/${id}/consent`, "PUT", consent, fetchAsParent);
}

/** Renaming, removing and adding are the parent's: a child's session is refused them. */
export function renameLearner(
  id: string,
  name: string,
): Promise<RenamedLearner> {
  return call(`${LEARNERS_URL}/${id}`, "PATCH", { name }, fetchAsParent);
}

/** Their plan, progress, lessons and conversations go with them. */
export async function removeLearner(id: string): Promise<AccountLearner[]> {
  return (
    await call<Listed>(
      `${LEARNERS_URL}/${id}`,
      "DELETE",
      undefined,
      fetchAsParent,
    )
  ).learners;
}

/** A session for the learner. With the device's id, its own record joins theirs, once. */
export function learnerSession(id: string, device?: string): Promise<Issued> {
  const body = device ? { deviceId: device } : {};
  return call(`${LEARNERS_URL}/${id}/session`, "POST", body);
}

/** Every learner and everything kept for them. The Google account stays Google's. Only a parent's
 * session made from a Google sign-in just now may: not the PIN's. */
export function deleteAccount(): Promise<void> {
  return call(ACCOUNT_URL, "DELETE", undefined, fetchAsParent);
}
