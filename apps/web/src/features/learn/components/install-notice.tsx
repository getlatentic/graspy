import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallOffer } from "@/hooks/use-install-offer";
import { useI18n } from "@/lib/i18n-context";
import { dismissInstall, install } from "@/lib/install";

/** A quiet card floating above the page's foot, so it moves nothing when it appears late (Chrome
 * sends its event after load). A button where the browser can install the app, the steps where only
 * the learner can (Safari on iOS). Gone once dismissed, and in the installed app. */
export function InstallNotice() {
  const { t } = useI18n();
  const offer = useInstallOffer();
  if (!offer) return null;

  return (
    <div className="absolute inset-x-4 bottom-3 z-10 mx-auto flex max-w-md items-center gap-3 rounded-card border border-accent-line bg-accent-soft py-1 ps-4 pe-1 text-sm text-ink shadow-lift">
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
