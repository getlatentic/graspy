import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";
import { useAgreement } from "../hooks/use-agreement";
import { ConsentProblemNote } from "./consent-problem-note";

/** Recordings are the parent's: they sign in with Google again, so a learner on the same
 * device does not reach them. */
export function ParentSignIn({
  start,
}: {
  start: (firebaseIdToken: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const signIn = useAgreement(start);
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-pretty text-ink">{t("voiceRecordings.signInAgain")}</p>
      <Button
        variant="secondary"
        className="self-start"
        onClick={signIn.agree}
        disabled={signIn.busy}
      >
        <LogIn className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {signIn.busy ? t("you.signingIn") : t("you.signIn")}
      </Button>
      {signIn.problem && <ConsentProblemNote problem={signIn.problem} />}
    </Card>
  );
}
