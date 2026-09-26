import { currentAccount, learnerKeyOf } from "@/lib/account/account-store";
import { deviceId } from "@/lib/device-id";

/** Whose answers these are: the account's learner, or a device learning signed out. */
export function voiceLearnerKey(): string | null {
  const account = currentAccount();
  if (account) return learnerKeyOf(account);
  return `device/${deviceId()}`;
}
