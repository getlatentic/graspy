import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { Input } from "@/components/ui/input";
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

const cleaned = (typed: string) => typed.replace(/[\s-]/g, "").toUpperCase();

/** What the phone is asked to approve: the device, where and when it asked, and which learner
 * the TV learns as. The code is not shown here: the Approve button waits for the last four
 * characters of it as the TV's own screen shows them, which a person who is not looking at the
 * TV cannot give. Nothing is approved until the button is pressed. */
export function TvConfirm({
  asked,
  learners,
  chosen,
  problem,
  onApprove,
  onDeny,
}: {
  asked: TvAsked;
  learners: AccountLearner[];
  chosen: string | null;
  /** Shown beside the end of the code when it was wrong. */
  problem: string | null;
  onApprove: (learnerId: string, end: string) => void;
  onDeny: () => void;
}) {
  const { t, locale } = useI18n();
  const [picked, setPicked] = useState(
    learners.find((learner) => learner.id === chosen)?.id ??
      learners[0]?.id ??
      null,
  );
  const [end, setEnd] = useState("");
  const place = placeOf(asked.country, locale);
  const ready = !!picked && cleaned(end).length === END_LENGTH;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t("tvLink.confirm", { device: asked.label })}
      </h1>
      <p className="text-center text-sm text-muted">
        {[place, timeAgo(asked.createdAt, locale)].filter(Boolean).join(" · ")}
      </p>
      <p className="text-pretty text-center font-semibold text-ink">
        {t("tvLink.warn")}
      </p>
      <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
        {t("tvLink.endLabel")}
        <Input
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={END_LENGTH + 2}
          aria-invalid={problem !== null}
          className="h-14 text-center font-mono text-2xl font-bold uppercase tracking-widest"
        />
      </label>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      )}
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
          disabled={!ready}
          onClick={() => picked && onApprove(picked, cleaned(end))}
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
