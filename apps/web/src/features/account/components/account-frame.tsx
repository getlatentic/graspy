import type { ReactNode } from "react";
import OnboardingFrame from "@/features/onboarding/components/onboarding-frame";

/** Signing in and choosing a learner, in the frame onboarding uses: the card sits in the middle of
 * the room under the header, a little above the middle of the page. */
export function AccountFrame({ children }: { children: ReactNode }) {
  return (
    <OnboardingFrame>
      <main className="flex flex-1 items-center justify-center pb-24">
        <div className="h-fit w-full max-w-xl rounded-4xl bg-white/85 p-6 shadow-2xl shadow-accent/15 ring-1 ring-white/50 backdrop-blur sm:p-10">
          {children}
        </div>
      </main>
    </OnboardingFrame>
  );
}
