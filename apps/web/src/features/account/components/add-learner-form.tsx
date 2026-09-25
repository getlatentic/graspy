import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";

/** Adding a learner asks their name, and that whoever adds them is them or their
 * parent or guardian. */
export function AddLearnerForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (name: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [guardian, setGuardian] = useState(false);

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("learners.add")}
      </Button>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAdd(name.trim());
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="learner-name" className="text-sm font-medium text-ink">
        {t("learners.nameLabel")}
      </label>
      <input
        id="learner-name"
        value={name}
        maxLength={40}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        className="w-full rounded-2xl border border-accent-line bg-white px-4 py-3 text-base text-ink shadow-sm focus:border-accent focus:ring-2 focus:ring-accent"
      />
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={guardian}
          onChange={(event) => setGuardian(event.target.checked)}
          className="mt-0.5 size-4 accent-accent"
        />
        {t("learners.guardian")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim() || !guardian}>
          {t("learners.addButton")}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("learners.cancel")}
        </Button>
      </div>
    </form>
  );
}
