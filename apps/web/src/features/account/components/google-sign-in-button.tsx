import { GoogleMark } from "@/components/brand/google-mark";
import { Button } from "@/components/ui/button";
import type { Size, Variant } from "@/components/ui/button-styles";
import { useI18n } from "@/lib/i18n-context";
import { useGoogleSignIn } from "../hooks/use-google-sign-in";

export function GoogleSignInButton({
  variant = "secondary",
  size,
  className = "self-start",
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  const { t } = useI18n();
  const google = useGoogleSignIn();
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={google.signIn}
        disabled={google.busy}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white">
          <GoogleMark className="size-4" />
        </span>
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
