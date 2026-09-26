import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n-context";
import { SignInLink } from "@/features/account/components/sign-in-link";
import OnboardingFrame from "./onboarding-frame";

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OnboardingFrame action={<SignInLink />}>
      <div className="mt-12 flex flex-1 items-center">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] lg:items-stretch lg:gap-10">
          <Welcome />

          <div className="flex h-full lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
            <div className="relative w-full rounded-4xl bg-white/85 p-8 shadow-2xl shadow-accent/15 ring-1 ring-white/50 backdrop-blur min-h-160 sm:p-10 lg:h-full lg:p-12 xl:min-h-0">
              <div
                className="absolute inset-x-10 top-0 h-20 rounded-t-4xl bg-surface"
                aria-hidden
              />
              <div className="relative flex h-full min-h-0 flex-col lg:overflow-clip">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </OnboardingFrame>
  );
}

function Welcome() {
  const { t } = useI18n();
  return (
    <div className="hidden lg:sticky lg:top-8 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col lg:justify-center">
      <div className="relative z-10">
        <div
          className="absolute -start-20 top-1/2 -z-10 size-64 -translate-y-1/2 rounded-full bg-accent/20 blur-3xl"
          aria-hidden
        />
        <h2 className="text-balance text-5xl font-extrabold leading-tight tracking-tight text-ink lg:text-6xl">
          {t("onboarding.heroTitle")}
          <br />
          <span className="text-accent-ink">
            {t("onboarding.heroHighlight")}
          </span>
        </h2>
      </div>
    </div>
  );
}
