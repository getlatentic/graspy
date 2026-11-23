import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { GoogleMark } from "@/components/brand/google-mark";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { CodeBoxes } from "@/components/ui/code-boxes";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { AccountFrame } from "../components/account-frame";
import { ProblemNote } from "../components/problem-note";
import { TvConfirm } from "../components/tv-confirm";
import { TvList } from "../components/tv-list";
import { useLearners } from "../hooks/use-learners";
import { useParentGate } from "../hooks/use-parent-gate";
import { useParentSignIn } from "../hooks/use-parent-sign-in";
import { useTvApproval, type ApprovalProblem } from "../hooks/use-tv-approval";
import { useTvs } from "../hooks/use-tvs";

const PROBLEMS: Record<ApprovalProblem, string> = {
  invalid: "tvLink.invalid",
  inUse: "tvLink.inUse",
  wrongEnd: "tvLink.wrongEnd",
  busy: "tvLink.busy",
  full: "tvLink.full",
  consent: "tvLink.consent",
  failed: "tvLink.failed",
};

/** The characters in a whole code. */
const CODE_LENGTH = 8;

/** The code a TV's QR code carries, in the address after the #, which no server is sent. */
function codeInAddress(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("code") ?? "";
}

/** What the server compares: case, spaces and dashes are not part of a code. */
const normalised = (typed: string) => typed.replace(/[\s-]/g, "").toUpperCase();

/**
 * Where a TV is linked, on a phone, in three steps: the QR code opens this page, Google signs the
 * parent in once if the phone is not already (that one sign-in is the parent's session, so none
 * is asked for again), and the last four characters of the code shown on the TV are typed.
 */
export default function TvLinkPage() {
  const account = useAccount();
  const gate = useParentGate();
  return (
    <AccountFrame>
      {account && !gate.needsParent ? (
        <Linking refused={gate.refused} />
      ) : (
        <SignInOnce signedIn={gate.signedIn} />
      )}
    </AccountFrame>
  );
}

/** One Google button, whose sign-in makes the parent's session; nothing else is asked first. */
function SignInOnce({ signedIn }: { signedIn: () => void }) {
  const { t } = useI18n();
  const parent = useParentSignIn(signedIn);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t("tvLink.title")}
      </h1>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={parent.signIn}
        disabled={parent.busy}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white">
          <GoogleMark className="size-4" />
        </span>
        {parent.busy ? t("you.signingIn") : t("you.signIn")}
      </Button>
      {parent.problem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {parent.problem === "popupBlocked"
            ? t("you.signInBlocked")
            : t("you.signInFailed")}
        </p>
      )}
    </div>
  );
}

function Linking({ refused }: { refused: (error: unknown) => boolean }) {
  const { t } = useI18n();
  const account = useAccount();
  const { learners, failed } = useLearners();
  const { tvs, reload, remove } = useTvs(true, refused);
  const { step, problem, lookUp, approve, deny, reset } = useTvApproval(
    reload,
    refused,
  );
  const linkCode = useRef(codeInAddress(window.location.hash)).current;
  // The code from the QR code is looked up at once; one typed by hand is asked for first.
  const [fromLink, setFromLink] = useState(linkCode !== "");

  const looked = useRef(false);
  useEffect(() => {
    // Once, when the page opens with a code in its address.
    if (!linkCode || looked.current) return;
    looked.current = true;
    lookUp(normalised(linkCode));
  }, [linkCode, lookUp]);

  useEffect(() => {
    if (problem && fromLink) setFromLink(false);
  }, [problem, fromLink]);

  if (
    step.kind === "checking" ||
    (!learners && !failed) ||
    (fromLink && step.kind === "code")
  ) {
    return <Spinner className="mx-auto size-6 text-accent-ink" />;
  }
  if (step.kind === "confirm") {
    return (
      <TvConfirm
        asked={step.asked}
        learners={learners ?? []}
        chosen={account?.learner?.id ?? null}
        problem={problem === "wrongEnd" ? t(PROBLEMS.wrongEnd) : null}
        onApprove={(learnerId, end) => approve(step, learnerId, end)}
        onDeny={() => deny(step.code)}
      />
    );
  }
  if (step.kind === "done" || step.kind === "denied") {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-balance font-display text-2xl font-semibold text-ink sm:text-3xl">
          {t(step.kind === "done" ? "tvLink.done" : "tvLink.denied")}
        </h1>
        <div className="flex flex-wrap gap-3">
          <Link to="/app" className={buttonStyles("primary", "lg")}>
            {t("tvLink.finish")}
          </Link>
          <Button variant="ghost" size="lg" onClick={reset}>
            {t("tvLink.another")}
          </Button>
        </div>
        <TvList tvs={tvs} onRemove={remove} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-balance text-center font-display text-2xl font-semibold text-ink sm:text-3xl">
          {t("tvLink.title")}
        </h1>
        <p className="text-center text-sm font-semibold text-ink">
          {t("tvLink.code")}
        </p>
        <CodeBoxes
          length={CODE_LENGTH}
          label={t("tvLink.codeBox")}
          invalid={problem === "invalid"}
          onComplete={(code) => lookUp(normalised(code))}
          className="gap-1"
        />
        {problem && <ProblemNote>{t(PROBLEMS[problem])}</ProblemNote>}
      </div>
      <TvList tvs={tvs} onRemove={remove} />
    </div>
  );
}
