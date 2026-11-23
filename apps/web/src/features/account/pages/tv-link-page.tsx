import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/lib/account/use-account";
import { useI18n } from "@/lib/i18n-context";
import { AccountFrame } from "../components/account-frame";
import { GoogleSignInButton } from "../components/google-sign-in-button";
import { ProblemNote } from "../components/problem-note";
import { TvConfirm } from "../components/tv-confirm";
import { TvList } from "../components/tv-list";
import { useLearners } from "../hooks/use-learners";
import { useTvApproval, type ApprovalProblem } from "../hooks/use-tv-approval";
import { useTvs } from "../hooks/use-tvs";

const PROBLEMS: Record<ApprovalProblem, string> = {
  invalid: "tvLink.invalid",
  busy: "tvLink.busy",
  full: "tvLink.full",
  consent: "tvLink.consent",
  failed: "tvLink.failed",
};

/** The code a TV's QR code carries, in the address after the #, which no server is sent. */
function codeInAddress(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("code") ?? "";
}

/** What the server compares: case, spaces and dashes are not part of a code. */
const normalised = (typed: string) => typed.replace(/[\s-]/g, "").toUpperCase();

/** Where a TV's code is entered, on a phone: sign in if needed, give the code, and approve or deny
 * the TV it names. */
export default function TvLinkPage() {
  const account = useAccount();
  return <AccountFrame>{account ? <Linking /> : <SignInFirst />}</AccountFrame>;
}

function SignInFirst() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-balance font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t("tvLink.signIn")}
      </h1>
      <GoogleSignInButton variant="primary" size="lg" className="w-full" />
    </div>
  );
}

function Linking() {
  const { t } = useI18n();
  const account = useAccount();
  const { learners, failed } = useLearners();
  const { tvs, reload, remove } = useTvs();
  const { step, problem, lookUp, approve, deny, reset } = useTvApproval(reload);
  const [typed, setTyped] = useState(() => codeInAddress(window.location.hash));

  if (step.kind === "checking" || (!learners && !failed)) {
    return <Spinner className="mx-auto size-6 text-accent-ink" />;
  }
  if (step.kind === "confirm") {
    return (
      <div className="flex flex-col gap-6">
        <TvConfirm
          code={step.code}
          asked={step.asked}
          learners={learners ?? []}
          chosen={account?.learner?.id ?? null}
          onApprove={(learnerId) => approve(step.code, learnerId)}
          onDeny={() => deny(step.code)}
        />
        {problem && <ProblemNote>{t(PROBLEMS[problem])}</ProblemNote>}
      </div>
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
      <CodeForm
        typed={typed}
        onType={setTyped}
        problem={problem}
        onSubmit={(code) => lookUp(normalised(code))}
      />
      <TvList tvs={tvs} onRemove={remove} />
    </div>
  );
}

function CodeForm({
  typed: code,
  onType: setCode,
  problem,
  onSubmit,
}: {
  typed: string;
  onType: (code: string) => void;
  problem: ApprovalProblem | null;
  onSubmit: (code: string) => void;
}) {
  const { t } = useI18n();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) onSubmit(code);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-balance font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t("tvLink.title")}
      </h1>
      <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
        {t("tvLink.code")}
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          dir="ltr"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          aria-invalid={problem === "invalid"}
          className="h-14 text-center font-mono text-2xl font-bold uppercase tracking-widest"
        />
      </label>
      {problem && <ProblemNote>{t(PROBLEMS[problem])}</ProblemNote>}
      <Button type="submit" size="lg" disabled={!code.trim()}>
        {t("tvLink.next")}
      </Button>
    </form>
  );
}
