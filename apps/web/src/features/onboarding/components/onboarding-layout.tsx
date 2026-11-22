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
      <div className="flex flex-1 pb-17 pt-6">
        <div className="m-auto w-full max-w-lg">{children}</div>
      </div>
    </OnboardingFrame>
  );
}
