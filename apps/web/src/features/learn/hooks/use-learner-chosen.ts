import { useEffect } from "react";
import { useNavigate } from "react-router";
import { leaveForGood } from "@/lib/account/learner-choice";
import { useAccount } from "@/lib/account/use-account";

/** False while a signed-in device has no learner chosen: just signed in, when the device's
 * own plan joins the learner chosen next, or with its learner removed on another device,
 * when nothing of them stays and the app starts again. */
export function useLearnerChosen(): boolean {
  const account = useAccount();
  const navigate = useNavigate();
  const unchosen = account !== null && account.learner === null;
  const deviceJoins = account?.deviceJoins ?? true;

  useEffect(() => {
    if (!unchosen) return;
    if (deviceJoins) {
      navigate("/app/learners", { replace: true });
      return;
    }
    void leaveForGood().finally(() => window.location.assign("/app/learners"));
  }, [unchosen, deviceJoins, navigate]);

  return !unchosen;
}
