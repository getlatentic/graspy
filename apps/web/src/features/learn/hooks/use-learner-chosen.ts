import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { rememberChat } from "@/lib/account/chat-return";
import { leaveForGood } from "@/lib/account/learner-choice";
import { useAccount } from "@/lib/account/use-account";

/** False while a signed-in device has no learner chosen: just signed in, when the device's
 * own plan joins the learner chosen next, or with its learner removed on another device,
 * when nothing of them stays and the app starts again. A chat or lesson asked for meanwhile is
 * kept, and is where they arrive. */
export function useLearnerChosen(): boolean {
  const account = useAccount();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const unchosen = account !== null && account.learner === null;
  const deviceJoins = account?.deviceJoins ?? true;

  useEffect(() => {
    if (!unchosen) return;
    rememberChat(`${pathname}${search}`);
    if (deviceJoins) {
      navigate("/app/learners", { replace: true });
      return;
    }
    void leaveForGood().finally(() => window.location.assign("/app/learners"));
  }, [unchosen, deviceJoins, navigate, pathname, search]);

  return !unchosen;
}
