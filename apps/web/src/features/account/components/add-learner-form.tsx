import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";

/** Adding a learner asks their name, and that whoever adds them is them or their
 * parent or guardian. */
export function AddLearnerForm({
  busy,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  onAdd: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [guardian, setGuardian] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAdd(name.trim());
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          {t("learners.addTitle")}
        </h1>
        <p className="mt-2 text-pretty text-muted">{t("learners.addBody")}</p>
      </div>
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
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-2xl border border-accent-line bg-white px-4 py-3 text-base text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <label className="flex items-start gap-3 rounded-2xl bg-accent-soft/60 p-4 text-sm text-ink">
        <input
          type="checkbox"
          checked={guardian}
          onChange={(event) => setGuardian(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        {t("learners.guardian")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim() || !guardian}>
          {t("learners.addButton")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t("learners.cancel")}
        </Button>
      </div>
    </form>
  );
}
