import { Button } from "@/components/ui/button";
import type { TvDevice } from "@/lib/account/tv-link-api";
import { useI18n } from "@/lib/i18n-context";
import { timeAgo } from "@/lib/time-ago";

/** The TVs signed in to the account, each with a way to sign it out. */
export function TvList({
  tvs,
  onRemove,
}: {
  tvs: TvDevice[];
  onRemove: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  if (tvs.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="tv-list-title">
      <h2 id="tv-list-title" className="text-lg font-semibold text-ink">
        {t("tvLink.tvs")}
      </h2>
      <ul className="flex flex-col gap-2">
        {tvs.map((tv) => (
          <li
            key={tv.id}
            className="flex items-center justify-between gap-3 rounded-control bg-surface p-3 ring-1 ring-line"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">
                {tv.label}
                {tv.learner ? ` · ${tv.learner.name}` : ""}
              </p>
              <p className="text-sm text-muted">
                {timeAgo(tv.lastUsedAt, locale)}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              aria-label={t("tvLink.removeNamed", { name: tv.label })}
              onClick={() => onRemove(tv.id)}
            >
              {t("tvLink.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
