import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallOffer } from "@/hooks/use-install-offer";
import { useI18n } from "@/lib/i18n-context";
import { dismissInstall, install } from "@/lib/install";

/** A quiet strip under the top bar: a button where the browser can install the app, the steps
 * where only the learner can (Safari on iOS). Gone once dismissed, and in the installed app. */
export function InstallNotice() {
  const { t } = useI18n();
  const offer = useInstallOffer();
  if (!offer) return null;

  return (
    <div className="flex items-center gap-3 border-b border-accent-line bg-accent-soft px-4 py-1 text-sm text-ink sm:px-6">
      {offer === "steps" && (
        <Share className="size-4 shrink-0 text-accent-ink" aria-hidden="true" />
      )}
      <p className="min-w-0 flex-1">
        {t(offer === "prompt" ? "install.title" : "install.steps")}
      </p>
      {offer === "prompt" && (
        <Button size="sm" onClick={() => void install()}>
          {t("install.action")}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("install.dismiss")}
        onClick={dismissInstall}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
