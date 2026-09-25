import { Link, useLocation } from "react-router";
import { Logo } from "@/components/brand/logo";
import { SECTIONS, sectionOf } from "@/features/learn/lib/app-sections";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";

export default function TopMenu() {
  const { t } = useI18n();
  const current = sectionOf(useLocation().pathname);

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/app/learn"
          aria-label={t("menu.tagline")}
          className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Logo />
        </Link>
        <nav aria-label={t("nav.label")} className="hidden gap-1 lg:flex">
          {SECTIONS.map((section) => {
            const active = section.id === current;
            return (
              <Link
                key={section.id}
                to={section.path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-control px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "bg-accent-soft text-accent-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                {t(section.labelKey)}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
