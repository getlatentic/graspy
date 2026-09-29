import { Button } from "@/components/ui/button";
import type { Variant } from "@/components/ui/button-styles";
import type { useSignOut } from "@/features/learn/hooks/use-sign-out";
import { useI18n } from "@/lib/i18n-context";

/** Signing out as the account card does it: what is unsent is sent first, and when it cannot
 * be, the parent is asked before it is lost. Nothing is wiped until they say so. */
export function SignOutControl({
  leave,
  label,
  variant = "secondary",
  className,
}: {
  leave: ReturnType<typeof useSignOut>;
  /** In place of "Sign out". */
  label?: string;
  variant?: Variant;
  className?: string;
}) {
  const { t } = useI18n();
  if (!leave.unsent) {
    return (
      <Button
        variant={variant}
        size="sm"
        className={className}
        onClick={() => void leave.start()}
        disabled={leave.busy}
      >
        {leave.busy ? t("you.signingOut") : (label ?? t("you.signOut"))}
      </Button>
    );
  }
  return (
    <div role="alertdialog" className="flex flex-col gap-2">
      <p className="text-sm font-medium text-danger">
        {t("you.signOutUnsent")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={leave.anyway} disabled={leave.busy}>
          {t("you.signOutAnyway")}
        </Button>
        <Button variant="secondary" size="sm" onClick={leave.cancel}>
          {t("you.cancel")}
        </Button>
      </div>
    </div>
  );
}
