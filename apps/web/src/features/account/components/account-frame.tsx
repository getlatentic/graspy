import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import OnboardingFrame from "@/features/onboarding/components/onboarding-frame";

/** Signing in and choosing a learner, in the frame onboarding uses: the card sits in the middle of
 * the room under the header, a little above the middle of the page on a screen wide enough to have
 * room. Auto margins centre it and give way to the padding when the card is taller than the room. */
export function AccountFrame({
  children,
  wide = false,
}: {
  children: ReactNode;
  /** For a card with two columns, on a screen far from the reader. */
  wide?: boolean;
}) {
  return (
    <OnboardingFrame>
      <main className="flex flex-1 py-6 sm:pb-24">
        <div
          className={cn(
            "m-auto w-full rounded-4xl bg-surface/85 p-5 shadow-2xl shadow-accent/15 ring-1 ring-line backdrop-blur sm:p-10",
            wide ? "max-w-4xl" : "max-w-xl",
          )}
        >
          {children}
        </div>
      </main>
    </OnboardingFrame>
  );
}
