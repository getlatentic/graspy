import type { ReactNode } from "react";
import { Scene, SceneBand } from "@/components/brand/scene";
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

          <div className="h-24 overflow-hidden rounded-card sm:h-32 lg:hidden">
            <SceneBand />
          </div>

          <div className="flex h-full lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
            <div className="relative w-full rounded-sheet border border-line bg-surface p-8 shadow-lift min-h-160 sm:p-10 lg:h-full lg:p-12 xl:min-h-0">
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
  return (
    <div className="hidden lg:sticky lg:top-8 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col lg:justify-center">
      <div className="aspect-4/5 max-h-full overflow-hidden rounded-sheet">
        <Scene />
      </div>
    </div>
  );
}
