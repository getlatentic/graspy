import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import type { AccountLearner } from "@/lib/account/learners-api";
import type { TvAsked } from "@/lib/account/tv-link-api";
import { useI18n } from "@/lib/i18n-context";
import { timeAgo } from "@/lib/time-ago";

function placeOf(country: string | null, locale: string): string | null {
  if (!country) return null;
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(country) ?? null
    );
  } catch {
    return country;
  }
}

/** What the phone is asked to approve: the device, where and when it asked, and the code it
 * shows, to be compared with the TV's screen, and which learner the TV learns as. Nothing is
 * approved until the person presses the button. */
export function TvConfirm({
  code,
  asked,
  learners,
  chosen,
  onApprove,
  onDeny,
}: {
  code: string;
  asked: TvAsked;
  learners: AccountLearner[];
  chosen: string | null;
  onApprove: (learnerId: string) => void;
  onDeny: () => void;
}) {
  const { t, locale } = useI18n();
  const [picked, setPicked] = useState(
    learners.find((learner) => learner.id === chosen)?.id ??
      learners[0]?.id ??
      null,
  );
  const place = placeOf(asked.country, locale);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t("tvLink.confirm", { device: asked.label })}
      </h1>
      <p
        dir="ltr"
        className="text-center font-mono text-4xl font-bold tracking-widest text-ink"
      >
        {code.slice(0, 4)} {code.slice(4)}
      </p>
      <p className="text-center text-sm text-muted">
        {[place, timeAgo(asked.createdAt, locale)].filter(Boolean).join(" · ")}
      </p>
      {learners.length === 0 ? (
        <Link to="/app/learners" className={buttonStyles("secondary", "lg")}>
          {t("tvLink.addLearner")}
        </Link>
      ) : (
        learners.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-ink">
              {t("tvLink.learner")}
            </legend>
            {learners.map((learner) => (
              <label
                key={learner.id}
                className="flex items-center gap-3 rounded-control bg-surface p-3 ring-1 ring-line"
              >
                <input
                  type="radio"
                  name="learner"
                  checked={picked === learner.id}
                  onChange={() => setPicked(learner.id)}
                  className="size-5 accent-accent"
                />
                <span className="font-semibold text-ink">{learner.name}</span>
              </label>
            ))}
          </fieldset>
        )
      )}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          size="lg"
          disabled={!picked}
          onClick={() => picked && onApprove(picked)}
          className="sm:flex-1"
        >
          {t("tvLink.approve")}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={onDeny}
          className="sm:flex-1"
        >
          {t("tvLink.deny")}
        </Button>
      </div>
    </div>
  );
}
