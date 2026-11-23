import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  acknowledgePinActivity,
  getPinActivity,
  type PinEvent,
} from "@/lib/account/parent-pin-api";
import { prepareSignIn, signInAgain } from "@/lib/account/sign-in";
import { consentProblemOf } from "@/lib/account/consent-problem";
import { startParentSession } from "@/lib/api/session";
import { useI18n } from "@/lib/i18n-context";

/** What has happened to the parent PIN that the parent has not yet seen: wrong PINs that locked it,
 * it turned off, a reset. A child who burns guesses leaves a mark here. Anyone on the account may
 * read it; clearing it takes a Google sign-in, which a child on a shared phone cannot give. */
export function PinActivityNotice() {
  const { t, locale } = useI18n();
  const [events, setEvents] = useState<PinEvent[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(prepareSignIn, []);
  useEffect(() => {
    let current = true;
    getPinActivity()
      .then((found) => current && setEvents(found))
      .catch((error: unknown) =>
        console.warn("Reading what happened to the PIN failed:", error),
      );
    return () => {
      current = false;
    };
  }, []);

  // Not async: Google's window must open within the tap.
  const dismiss = useCallback(() => {
    setBusy(true);
    signInAgain()
      .then(startParentSession)
      // Only what is on the page: what happens after it was drawn stays for the next visit.
      .then(() =>
        acknowledgePinActivity(Math.max(...events.map((one) => one.id))),
      )
      .then(() => setEvents([]))
      .catch((error: unknown) => {
        if (consentProblemOf(error)) {
          console.warn("Clearing the PIN notice failed:", error);
        }
      })
      .finally(() => setBusy(false));
  }, [events]);

  if (events.length === 0) return null;
  const date = (at: number) => new Date(at).toLocaleDateString(locale);
  const sentence = (event: PinEvent): string => {
    const values = { count: event.count ?? 0, date: date(event.at) };
    if (event.kind === "locked") return t("parentPin.noticeLocked", values);
    if (event.kind === "disabled") return t("parentPin.noticeDisabled", values);
    if (event.kind === "wrong") return t("parentPin.noticeWrong", values);
    if (event.kind === "tv_linked") return t("parentPin.noticeTv", values);
    if (event.kind === "consent") return t("parentPin.noticeConsent", values);
    const reset = t("parentPin.noticeReset", values);
    return event.count
      ? `${reset} ${t("parentPin.noticeResetTvs", values)}`
      : reset;
  };
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-control bg-accent-soft p-3 text-sm text-ink"
    >
      <ul className="flex flex-col gap-1">
        {events.map((event) => (
          <li key={event.id}>{sentence(event)}</li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={dismiss}
        disabled={busy}
      >
        {t("parentPin.noticeDismiss")}
      </Button>
    </div>
  );
}
