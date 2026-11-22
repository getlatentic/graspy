import type { ReactNode } from "react";
import OnboardingFrame from "./onboarding-frame";

/**
 * The form sits directly on the page's ground, in the middle of the viewport.
 * The bottom padding is the top padding plus the header, so it is as far from
 * the foot of the page as from the top.
 */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OnboardingFrame>
      <div className="-mb-8 flex flex-1 pb-0 pt-6 sm:mb-0 sm:pb-17">
        <div className="flex w-full max-w-lg flex-1 flex-col sm:m-auto sm:block sm:flex-none">
          {children}
        </div>
      </div>
    </OnboardingFrame>
  );
}
