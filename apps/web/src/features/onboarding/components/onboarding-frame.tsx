import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/brand/logo";
import { useI18n } from "@/lib/i18n-context";

export default function OnboardingFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    // clip, not hidden: an overflow-hidden box can still scroll sideways.
    <div className="relative min-h-dvh overflow-clip art-ground theme-light text-on-art">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-[max(1rem,var(--page-gutter))] py-[max(2rem,var(--page-gutter-block))] sm:px-[max(1.5rem,var(--page-gutter))] lg:px-[max(2rem,var(--page-gutter))]">
        <header className="flex items-center py-2">
          <Link to="/" aria-label={t("onboarding.home")}>
            <Logo />
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
