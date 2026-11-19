import type { ReactNode } from "react";
import { Art } from "@/components/brand/art";
import type { AgeBand } from "@/lib/age-band";
import { SignInLink } from "@/features/account/components/sign-in-link";
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
    <OnboardingFrame action={<SignInLink />}>
      <div className="mt-12 flex flex-1 items-center">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] lg:items-stretch lg:gap-10">
          <Welcome band={band} />

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

/**
 * The picture beside the form: a still life for anyone until the class is
 * known, then a drawn learner for a child and a tween, and a desk for a teen or
 * university learner, so no one sees a child's picture who is not one.
 */
function Welcome({ band }: { band: AgeBand | null }) {
  return (
    <div className="hidden lg:sticky lg:top-8 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col lg:justify-center">
      <div className="aspect-4/5 max-h-full overflow-hidden rounded-sheet">
        {band === "child" || band === "tween" ? (
          <Art name="math" band={band} />
        ) : (
          <img
            src={
              band === "teen" ? "/brand/desk.webp" : "/brand/still-life.webp"
            }
            alt=""
            width={1024}
            height={1280}
            loading="lazy"
            decoding="async"
            className="block size-full object-cover"
          />
        )}
      </div>
    </div>
  );
}
