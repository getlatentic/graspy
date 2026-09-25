import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { useI18n } from "@/lib/i18n-context";
import { contactHref } from "@/features/landing/constants";

export default function OnboardingFrame({
  action,
  children,
}: {
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    // clip, not hidden: an overflow-hidden box can still scroll sideways.
    <div className="relative min-h-screen overflow-clip bg-canvas">
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-128 w-lg -translate-x-1/2 rounded-full bg-line/45 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-48 -right-3/20 size-136 rounded-full bg-accent/30 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-2">
          <Link to="/" aria-label={t("onboarding.home")}>
            <Logo />
          </Link>
          <nav className="flex items-center gap-5">
            <a
              href={contactHref()}
              className="text-sm font-medium text-muted transition hover:text-ink"
            >
              {t("onboarding.contact")}
            </a>
            {action}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
