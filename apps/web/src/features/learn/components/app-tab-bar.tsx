import { Link, useLocation } from "react-router";
import type { LucideIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  SECTIONS,
  sectionOf,
  type AppSection,
} from "@/features/learn/lib/app-sections";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import { UnreadDot } from "@/features/learn/components/unread-dot";

interface AppTabBarProps {
  /** The tutor is answering in a conversation the learner is not reading. */
  tutorBusy?: boolean;
  unread?: boolean;
  /** Overrides the address: the landing page is Home to a visitor. */
  home?: { path: string; current: AppSection };
  className?: string;
}

export function AppTabBar({
  tutorBusy = false,
  unread = false,
  home,
  className,
}: AppTabBarProps) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const current = home?.current ?? sectionOf(pathname);

  return (
    <nav
      aria-label={t("nav.label")}
      className={cn(
        "flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden",
        className,
      )}
    >
      {SECTIONS.map((section) => {
        const active = section.id === current;
        const isAsk = section.id === "ask";
        return (
          <Link
            key={section.id}
            to={section.id === "home" && home ? home.path : section.path}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              active ? "font-semibold text-accent-ink" : "text-subtle",
            )}
          >
            <TabIcon
              icon={section.icon}
              active={active}
              busy={isAsk && tutorBusy}
              unread={isAsk && unread}
            />
            <span className="truncate">{t(section.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

interface TabIconProps {
  icon: LucideIcon;
  active: boolean;
  busy: boolean;
  unread: boolean;
}

function TabIcon({ icon: Icon, active, busy, unread }: TabIconProps) {
  return (
    <span
      className={cn(
        "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
        active && "bg-accent-soft",
      )}
    >
      {busy ? (
        <Spinner className="size-6" />
      ) : (
        <Icon
          className={cn("size-6", !active && "text-faint")}
          strokeWidth={active ? 2.25 : 1.5}
          aria-hidden="true"
        />
      )}
      {unread && (
        <UnreadDot className="absolute end-3 top-0.5 size-2.5 ring-2 ring-surface" />
      )}
    </span>
  );
}
