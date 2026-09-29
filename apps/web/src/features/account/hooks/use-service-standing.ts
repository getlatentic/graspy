import { useCallback, useEffect, useState } from "react";
import { listLearners } from "@/lib/account/learners-api";
import {
  keepServiceConsent,
  serviceConsentKept,
} from "@/lib/account/service-consent";
import { useAccount } from "@/lib/account/use-account";

/** Whether a parent has agreed to graspy teaching the learner in use:
 * `checking` while the server is asked, `unchecked` when it could not be, and `needed` when
 * it holds no agreement. A device with no signed-in learner has nobody to ask, and is `agreed`. */
export type Standing = "checking" | "unchecked" | "needed" | "agreed";

type Checked = { key: string; standing: Exclude<Standing, "checking"> };

async function standingOnServer(
  uid: string,
  learner: string,
): Promise<Checked["standing"]> {
  const held = (await listLearners()).find((one) => one.id === learner);
  // A learner the account no longer holds is left by the session, not asked about here.
  if (!held) return "agreed";
  if (!held.serviceConsent) return "needed";
  keepServiceConsent(uid, learner);
  return "agreed";
}

/** The learner in use, asked of the server once and remembered on the device. */
export function useServiceStanding() {
  const account = useAccount();
  const uid = account?.uid;
  const learner = account?.learner?.id;
  const key = uid && learner ? `${uid}/${learner}` : null;
  const [checked, setChecked] = useState<Checked | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !uid || !learner || serviceConsentKept(uid, learner)) return;
    let current = true;
    standingOnServer(uid, learner)
      .catch((error: unknown) => {
        console.warn("Asking whether a parent agreed failed:", error);
        return "unchecked" as const;
      })
      .then((standing) => current && setChecked({ key, standing }));
    return () => {
      current = false;
    };
  }, [key, uid, learner, attempt]);

  const agreed = useCallback(() => {
    if (key) setChecked({ key, standing: "agreed" });
  }, [key]);
  const recheck = useCallback(() => {
    setChecked(null);
    setAttempt((tries) => tries + 1);
  }, []);

  let standing: Standing = "checking";
  if (!key) standing = "agreed";
  else if (checked?.key === key) standing = checked.standing;
  else if (uid && learner && serviceConsentKept(uid, learner))
    standing = "agreed";
  return { standing, learner: account?.learner ?? null, agreed, recheck };
}
