import type { ReactNode } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConsentProblem } from "@/lib/account/consent-problem";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import { ConsentProblemNote } from "./consent-problem-note";

/** What a parent reads before agreeing: the notice, word for word, then signing in with
 * Google again to agree. Declining leaves things as they were. */
export function ConsentStep({
  title,
  notice,
  busy,
  problem,
  onAgree,
  onDecline,
  heading: Heading = "h1",
  children,
}: {
  title: string;
  notice: string;
  busy: boolean;
  problem: ConsentProblem | null;
  /** Called by the tap itself: Google's window must open within it. */
  onAgree: () => void;
  onDecline: () => void;
  heading?: "h1" | "h2";
  /** What the parent chooses before agreeing, between the notice and the buttons. */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="consent-title" className="flex flex-col gap-5">
      <Heading
        id="consent-title"
        className={cn(
          "text-balance font-display font-bold text-ink",
          Heading === "h1" ? "text-2xl" : "text-xl",
        )}
      >
        {title}
      </Heading>
      <p
        lang="en"
        dir="ltr"
        className="text-pretty rounded-2xl bg-accent-soft/60 p-4 text-base text-ink"
      >
        {notice}
      </p>
      {children}
      <p className="text-sm text-muted">{t("consent.who")}</p>
      {problem && <ConsentProblemNote problem={problem} />}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAgree} disabled={busy}>
          <LogIn className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {busy ? t("you.signingIn") : t("consent.agree")}
        </Button>
        <Button variant="ghost" onClick={onDecline} disabled={busy}>
          {t("consent.decline")}
        </Button>
      </div>
    </section>
  );
}
