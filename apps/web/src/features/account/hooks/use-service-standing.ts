import { useCallback, useEffect, useState } from "react";
import { listLearners } from "@/lib/account/learners-api";
import {
  forgetServiceConsent,
  keepServiceConsent,
  serviceConsentKept,
} from "@/lib/account/service-consent";
import { useAccount } from "@/lib/account/use-account";
import { onConsentRequired } from "@/lib/api/consent-refusal";

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

// A refusal does not say which learner it was for (a call for the learner just left, or the one
// being chosen, may arrive late), so the server is asked about the one in use.
async function refusedFor(uid: string, learner: string): Promise<boolean> {
  try {
    const held = (await listLearners()).find((one) => one.id === learner);
    if (!held || held.serviceConsent) return false;
  } catch (error) {
    console.warn("Asking whether a parent agreed failed:", error);
    return false;
  }
  forgetServiceConsent(uid, learner);
  return true;
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

  // The server refuses a learner whose agreement it does not hold, whatever this device
  // remembers: the agreement is asked for again.
  useEffect(() => {
    if (!key || !uid || !learner) return;
    return onConsentRequired(() => {
      void refusedFor(uid, learner).then(
        (needed) => needed && setChecked({ key, standing: "needed" }),
      );
    });
  }, [key, uid, learner]);

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
