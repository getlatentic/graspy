import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { signOut } from "@/lib/account/sign-in";
import { SIGN_IN_PAGE } from "../components/sign-in-link";

/** Signs the device out, wiping what it holds, and leads to signing in again: for a parent
 * whose sign-in Firebase no longer holds, or who is stuck on an agreement and wants out. */
export function useSignOutToSignIn() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const start = useCallback(() => {
    setBusy(true);
    signOut()
      .catch((error: unknown) => console.warn("Signing out failed:", error))
      .finally(() => navigate(SIGN_IN_PAGE, { replace: true }));
  }, [navigate]);

  return { busy, start };
}
