import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";
import { useGoogleSignIn } from "../hooks/use-google-sign-in";

export function GoogleSignInButton({
  size,
  onSignedIn,
}: {
  size?: "sm";
  onSignedIn?: () => void;
}) {
  const { t } = useI18n();
  const google = useGoogleSignIn(onSignedIn);
  return (
    <>
      <Button
        variant="secondary"
        size={size}
        className="self-start"
        onClick={google.signIn}
        disabled={google.busy}
      >
        <LogIn className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {google.busy ? t("you.signingIn") : t("you.signIn")}
      </Button>
      {google.problem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {google.problem === "popupBlocked"
            ? t("you.signInBlocked")
            : t("you.signInFailed")}
        </p>
      )}
    </>
  );
}
