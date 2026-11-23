import { LogIn } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PinPad } from "@/components/ui/pin-pad";
import { Spinner } from "@/components/ui/spinner";
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH } from "@/lib/account/parent-pin-api";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import { useParentSession } from "../hooks/use-parent-session";
import { usePinGate, type PinError } from "../hooks/use-pin-gate";
import { ConsentProblemNote } from "./consent-problem-note";
import { ProblemNote } from "./problem-note";

const ERRORS: Record<PinError, string> = {
  wrong: "parentPin.wrong",
  mismatch: "parentPin.mismatch",
  easy: "parentPin.easy",
  busy: "parentPin.busy",
  failed: "parentPin.failed",
};

/** What only the parent may do waits behind the parent's PIN: with the parent's session in
 * force the children show, and without it the parent is asked for the PIN (or to set one, which
 * takes a Google sign-in once). The session lasts minutes, so a parent is asked at most once in
 * that time, and again when it ends. `onUnlocked` is called when the parent's session is in
 * force, as soon as it is; a gate with no children shows a spinner then. */
export function ParentGate({
  children,
  onUnlocked,
  onCancel,
  heading = "h2",
  framed = false,
}: {
  children?: ReactNode;
  onUnlocked?: () => void;
  /** Offers a way out, for a gate that was opened by a choice. */
  onCancel?: () => void;
  heading?: "h1" | "h2";
  /** Draws the gate as a card, where the page around it has none. */
  framed?: boolean;
}) {
  const unlocked = useParentSession();
  const opened = useRef(onUnlocked);
  useEffect(() => {
    opened.current = onUnlocked;
  });
  // Once for each time the session comes into force, though effects may run twice.
  const called = useRef(false);
  useEffect(() => {
    if (!unlocked) {
      called.current = false;
      return;
    }
    if (called.current) return;
    called.current = true;
    opened.current?.();
  }, [unlocked]);

  if (unlocked)
    return children ?? <Spinner className="mx-auto size-6 text-accent-ink" />;
  return (
    <section
      className={cn(
        "flex flex-col gap-5",
        framed && "rounded-card border border-line bg-surface p-5 shadow-card",
      )}
    >
      <Asking heading={heading} onCancel={onCancel} />
    </section>
  );
}

function Title({
  as: Heading,
  children,
}: {
  as: "h1" | "h2";
  children: ReactNode;
}) {
  const size = Heading === "h1" ? "text-2xl sm:text-3xl" : "text-xl";
  return (
    <Heading
      className={cn(
        "text-balance text-center font-display font-semibold text-ink",
        size,
      )}
    >
      {children}
    </Heading>
  );
}

function Asking({
  heading,
  onCancel,
}: {
  heading: "h1" | "h2";
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const gate = usePinGate();
  const { stage, busy, error, failures } = gate;
  const message = error ? t(ERRORS[error]) : null;
  const typed = (count: number) => t("parentPin.typed", { count });
  const back = onCancel && (
    <Button variant="ghost" className="self-center" onClick={onCancel}>
      {t("parentPin.cancel")}
    </Button>
  );

  switch (stage.kind) {
    case "loading":
      return <Spinner className="mx-auto size-6 text-accent-ink" />;
    case "unreachable":
      return (
        <div className="flex flex-col items-center gap-3">
          <ProblemNote>{t("learners.loadFailed")}</ProblemNote>
          <Button variant="secondary" onClick={gate.reload}>
            {t("learners.tryAgain")}
          </Button>
          {back}
        </div>
      );
    case "enter":
      return (
        <>
          <Title as={heading}>{t("parentPin.title")}</Title>
          <PinPad
            label={t("parentPin.title")}
            length={stage.length}
            deleteLabel={t("parentPin.delete")}
            typedLabel={typed}
            busy={busy}
            failures={failures}
            error={message}
            onEntered={(pin) => void gate.enter(pin)}
          />
          <Button variant="ghost" className="self-center" onClick={gate.forgot}>
            {t("parentPin.forgot")}
          </Button>
          {back}
        </>
      );
    case "locked":
      return (
        <Locked until={stage.until} heading={heading} gate={gate} back={back} />
      );
    case "disabled":
      return (
        <>
          <Title as={heading}>{t("parentPin.title")}</Title>
          <p role="status" className="text-center text-ink">
            {t("parentPin.disabled")}
          </p>
          <Button variant="ghost" className="self-center" onClick={gate.forgot}>
            {t("parentPin.forgot")}
          </Button>
          {back}
        </>
      );
    case "choose":
      return (
        <>
          <Title as={heading}>{t("parentPin.set")}</Title>
          <p className="text-center text-sm text-muted">
            {t("parentPin.choose")}
          </p>
          <PinPad
            key="choose"
            label={t("parentPin.set")}
            min={MIN_PIN_LENGTH}
            max={MAX_PIN_LENGTH}
            doneLabel={t("parentPin.next")}
            deleteLabel={t("parentPin.delete")}
            typedLabel={typed}
            failures={failures}
            error={message}
            onEntered={gate.choose}
          />
          {back}
        </>
      );
    case "again":
      return (
        <>
          <Title as={heading}>{t("parentPin.again")}</Title>
          <PinPad
            key="again"
            label={t("parentPin.again")}
            length={stage.pin.length}
            deleteLabel={t("parentPin.delete")}
            typedLabel={typed}
            error={message}
            onEntered={(second) => gate.again(stage.pin, second)}
          />
          {back}
        </>
      );
    case "save":
      return (
        <>
          <Title as={heading}>{t("parentPin.save")}</Title>
          {gate.problem && <ConsentProblemNote problem={gate.problem} />}
          <Button
            size="lg"
            className="self-center"
            onClick={() => gate.save(stage.pin)}
            disabled={busy}
          >
            <LogIn className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            {busy ? t("you.signingIn") : t("you.signIn")}
          </Button>
          {back}
        </>
      );
  }
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function Locked({
  until,
  heading,
  gate,
  back,
}: {
  until: number;
  heading: "h1" | "h2";
  gate: ReturnType<typeof usePinGate>;
  back: ReactNode;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now);
  const { reload } = gate;
  // The time left is looked at again as it passes, and the server is asked once the lock ends.
  useEffect(() => {
    if (now >= until) {
      reload();
      return;
    }
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(until - now, 30_000) + 50,
    );
    return () => clearTimeout(timer);
  }, [now, until, reload]);
  const left = Math.max(0, until - now);
  const text =
    left >= HOUR_MS
      ? t("parentPin.lockedHours", { count: Math.ceil(left / HOUR_MS) })
      : t("parentPin.lockedMinutes", {
          count: Math.max(1, Math.ceil(left / MINUTE_MS)),
        });
  return (
    <>
      <Title as={heading}>{t("parentPin.title")}</Title>
      <p role="status" className="text-center text-ink">
        {text}
      </p>
      <Button variant="ghost" className="self-center" onClick={gate.forgot}>
        {t("parentPin.forgot")}
      </Button>
      {back}
    </>
  );
}
