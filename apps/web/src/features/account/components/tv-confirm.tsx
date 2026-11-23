import { useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { CodeBoxes } from "@/components/ui/code-boxes";
import type { AccountLearner } from "@/lib/account/learners-api";
import type { TvAsked } from "@/lib/account/tv-link-api";
import { useI18n } from "@/lib/i18n-context";
import { timeAgo } from "@/lib/time-ago";

/** How many characters of the code the person types from the TV. */
export const END_LENGTH = 4;

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

/**
 * What the phone is asked to approve, and the whole of approving it: the device, where and when
 * it asked, and four boxes for the last four characters of the code as the TV's own screen shows
 * them. Typing the fourth is the approval, with no button after it. The characters prove the
 * person can see the TV, which a person sent a link cannot, and the line above them is the
 * person's own check that they are looking at it. The code is not shown here.
 *
 * With one learner the approval is for them. With more, the boxes wait for a choice: typing the
 * code must never approve for a learner the person did not pick.
 */
export function TvConfirm({
  asked,
  learners,
  problem,
  onApprove,
  onDeny,
}: {
  asked: TvAsked;
  learners: AccountLearner[];
  /** Shown above the boxes when the characters were wrong. */
  problem: string | null;
  onApprove: (learnerId: string, end: string) => void;
  onDeny: () => void;
}) {
  const { t, locale } = useI18n();
  const [picked, setPicked] = useState<string | null>(
    learners.length === 1 ? learners[0].id : null,
  );
  const place = placeOf(asked.country, locale);
  const instruction = useId();
  const warning = useId();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance text-center font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t("tvLink.confirm", { device: asked.label })}
      </h1>
      <p className="text-center text-sm text-muted">
        {[place, timeAgo(asked.createdAt, locale)].filter(Boolean).join(" · ")}
      </p>
      {learners.length === 0 && (
        <Link to="/app/learners" className={buttonStyles("secondary", "lg")}>
          {t("tvLink.addLearner")}
        </Link>
      )}
      {learners.length > 1 && (
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
      )}
      {picked && (
        <div className="flex flex-col gap-3">
          <p
            id={instruction}
            className="text-center text-sm font-semibold text-ink"
          >
            {t("tvLink.endLabel")}
          </p>
          <p id={warning} className="text-center text-sm text-muted">
            {t("tvLink.warn")}
          </p>
          <CodeBoxes
            length={END_LENGTH}
            label={t("tvLink.endBox")}
            describedBy={`${instruction} ${warning}`}
            invalid={problem !== null}
            onComplete={(end) => onApprove(picked, end)}
          />
          {problem && (
            <p
              role="alert"
              className="text-center text-sm font-medium text-danger"
            >
              {problem}
            </p>
          )}
        </div>
      )}
      <Button variant="ghost" size="lg" onClick={onDeny}>
        {t("tvLink.deny")}
      </Button>
    </div>
  );
}
