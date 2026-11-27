import { FIREBASE_CONFIG } from "@/lib/env";
import { useAccount } from "@/lib/account/use-account";

/** Signing in is offered while nobody is signed in on the device, and sign-in is set up. */
export function useSignInOffered(): boolean {
  const account = useAccount();
  return FIREBASE_CONFIG !== null && account === null;
}
