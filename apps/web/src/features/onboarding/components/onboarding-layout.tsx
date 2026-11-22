import type { ReactNode } from "react";
import { Scene } from "@/components/brand/scene";
import type { AgeBand } from "@/lib/age-band";
import OnboardingFrame from "./onboarding-frame";

/** `band` is null until the learner has chosen a class, which is what tells their age. */
export default function OnboardingLayout({
  band,
  children,
}: {
  band: AgeBand | null;
  children: ReactNode;
}) {
  return (
    // The bottom padding is the top padding plus the header, so the card sits in the middle of the viewport.
    <OnboardingFrame>
      <div className="flex flex-1 pb-17 pt-6">
        <div className="my-auto grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] lg:items-center lg:gap-10">
          <Welcome band={band} />

          <div className="relative flex w-full flex-col rounded-sheet border border-line bg-surface p-8 shadow-lift sm:p-10 lg:p-12">
            {children}
          </div>
        </div>
      </div>
    </OnboardingFrame>
  );
}

/**
 * The picture beside the form, resting directly on the page's ground: a still
 * life for anyone until the class is known, then the scene of the age band, so
 * no one sees a child's picture who is not one.
 */
function Welcome({ band }: { band: AgeBand | null }) {
  return (
    <div className="hidden lg:flex lg:justify-center">
      <Scene band={band} className="max-h-[72dvh]" />
    </div>
  );
}
