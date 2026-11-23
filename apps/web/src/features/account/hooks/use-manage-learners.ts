import { useCallback, useState } from "react";
import { currentAccount, setLearner } from "@/lib/account/account-store";
import { forgetLearner } from "@/lib/account/learner-choice";
import { renameLearner, type ServiceConsent } from "@/lib/account/learners-api";
import { consentProblemOf } from "@/lib/account/consent-problem";
import { deleteAccountAndSignOut, signInAgain } from "@/lib/account/sign-in";
import { startParentSession } from "@/lib/api/session";
import { useLearners } from "./use-learners";

/** Renames and removes the account's learners, and deletes the account. */
export function useManageLearners() {
  const listed = useLearners();
  const { reload, setLearners } = listed;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const attempt = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await work();
      return true;
    } catch (error) {
      console.warn("Changing the account's learners failed:", error);
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const rename = useCallback(
    (id: string, name: string) =>
      attempt(async () => {
        const renamed = await renameLearner(id, name);
        if (currentAccount()?.learner?.id === id) {
          setLearner({ id, name: renamed.name });
        }
        setLearners(
          (all) =>
            all &&
            all.map((one) => (one.id === id ? { ...one, ...renamed } : one)),
        );
      }),
    [attempt, setLearners],
  );

  const agreed = useCallback(
    (id: string, serviceConsent: ServiceConsent) =>
      setLearners(
        (all) =>
          all &&
          all.map((one) => (one.id === id ? { ...one, serviceConsent } : one)),
      ),
    [setLearners],
  );

  const remove = useCallback(
    (id: string) =>
      attempt(async () => {
        if (await forgetLearner(id)) window.location.assign("/app/learners");
        else reload();
      }),
    [attempt, reload],
  );

  // Firebase's user is deleted only for a Google sign-in just made, not for the parent PIN: the
  // sign-in is the tap's own, so its window opens, and a window closed is no failure.
  const deleteAccount = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      await startParentSession(await signInAgain());
      await deleteAccountAndSignOut();
      window.location.assign("/");
    } catch (error) {
      if (consentProblemOf(error) !== null) {
        console.warn("Deleting the account failed:", error);
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return { ...listed, busy, failed, rename, agreed, remove, deleteAccount };
}
