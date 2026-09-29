import { type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";

/** Adding a learner asks their name; a parent then agrees for them (see AddLearner). */
export function AddLearnerForm({
  name,
  onName,
  onContinue,
  onCancel,
}: {
  name: string;
  onName: (name: string) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onContinue();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold text-ink">
        {t("learners.addTitle")}
      </h1>
      <div className="flex flex-col gap-2">
        <label htmlFor="learner-name" className="text-sm font-medium text-ink">
          {t("learners.nameLabel")}
        </label>
        <input
          id="learner-name"
          value={name}
          maxLength={40}
          autoComplete="off"
          autoFocus
          onChange={(event) => onName(event.target.value)}
          className="w-full rounded-2xl border border-accent-line bg-white px-4 py-3 text-base text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!name.trim()}>
          {t("consent.continue")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("learners.cancel")}
        </Button>
      </div>
    </form>
  );
}
