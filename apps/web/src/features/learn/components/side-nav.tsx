import { Link, useLocation } from "react-router";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { sectionOf, type Section } from "@/features/learn/lib/app-sections";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";

interface SideNavProps {
  sections: readonly Section[];
  open: boolean;
  onToggle: () => void;
}

/** The learner's sections on a wide screen, folded to their icons when the learner wants the room;
 * a phone has the tab bar. */
export function SideNav({ sections, open, onToggle }: SideNavProps) {
  const { t } = useI18n();
  const current = sectionOf(useLocation().pathname);
  const Toggle = open ? PanelLeftClose : PanelLeftOpen;
  const toggleLabel = t(open ? "nav.collapse" : "nav.expand");

  return (
    <nav
      aria-label={t("nav.label")}
      className={cn(
        "hidden shrink-0 flex-col gap-1 border-e border-line bg-surface p-2 lg:flex",
        open ? "w-56" : "w-16",
      )}
    >
      {sections.map(({ id, path, labelKey, icon: Icon }) => {
        const active = id === current;
        return (
          <Link
            key={id}
            to={path}
            aria-current={active ? "page" : undefined}
            title={open ? undefined : t(labelKey)}
            className={cn(
              "flex items-center gap-3 rounded-control p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active
                ? "bg-accent-soft text-accent-ink"
                : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className={open ? "truncate" : "sr-only"}>{t(labelKey)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onToggle}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="mt-auto flex items-center rounded-control p-3 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Toggle
          className="size-5 shrink-0 rtl:-scale-x-100"
          aria-hidden="true"
        />
      </button>
    </nav>
  );
}
