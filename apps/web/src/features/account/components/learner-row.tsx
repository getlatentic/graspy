import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import type {
  AccountLearner,
  ServiceConsent,
} from "@/lib/account/learners-api";
import { useI18n } from "@/lib/i18n-context";
import { LEARNERS_PAGE } from "@/features/learn/lib/app-sections";
import { ConfirmCard } from "./confirm-card";
import { ServiceAgreement } from "./service-agreement";

type Mode = "shown" | "renaming" | "removing" | "agreeing";

const LINK = buttonStyles("secondary", "sm");

export function LearnerRow({
  learner,
  inUse,
  busy,
  onRename,
  onAgreed,
  onRemove,
}: {
  learner: AccountLearner;
  inUse: boolean;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onAgreed: (consent: ServiceConsent) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("shown");

  if (mode === "renaming") {
    return (
      <RenameForm
        name={learner.name}
        busy={busy}
        onSave={(name) =>
          void onRename(name).then((saved) => saved && setMode("shown"))
        }
        onCancel={() => setMode("shown")}
      />
    );
  }
  if (mode === "agreeing") {
    return (
      <ServiceAgreement
        heading="h2"
        learner={learner}
        busy={busy}
        onAgreed={(consent) => {
          onAgreed(consent);
          setMode("shown");
        }}
        onDecline={() => setMode("shown")}
      />
    );
  }
  if (mode === "removing") {
    return (
      <ConfirmCard
        question={t("learners.removeConfirm", { name: learner.name })}
        confirm={t("learners.removeYes", { name: learner.name })}
        busy={busy}
        onConfirm={onRemove}
        onCancel={() => setMode("shown")}
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{learner.name}</p>
        {inUse && <p className="text-xs text-muted">{t("learners.inUse")}</p>}
        {!learner.serviceConsent && (
          <p className="text-xs text-muted">{t("consent.needed")}</p>
        )}
      </div>
      {!learner.serviceConsent && (
        <Button size="sm" onClick={() => setMode("agreeing")}>
          {t("consent.agreeRow")}
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => setMode("renaming")}>
        {t("learners.rename")}
      </Button>
      <Link to={`${LEARNERS_PAGE}/${learner.id}/voice`} className={LINK}>
        {t("learners.recordings")}
      </Link>
      <Button variant="secondary" size="sm" onClick={() => setMode("removing")}>
        {t("learners.remove")}
      </Button>
    </div>
  );
}

function RenameForm({
  name,
  busy,
  onSave,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(draft.trim());
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        aria-label={t("learners.nameLabel")}
        value={draft}
        maxLength={40}
        onChange={(event) => setDraft(event.target.value)}
        className="min-w-0 flex-1 rounded-2xl border border-accent-line bg-white px-4 py-2 text-base text-ink shadow-sm focus:border-accent focus:ring-2 focus:ring-accent"
      />
      <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
        {t("learners.save")}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t("learners.cancel")}
      </Button>
    </form>
  );
}
