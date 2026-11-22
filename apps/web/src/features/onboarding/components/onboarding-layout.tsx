import type { ReactNode } from "react";
import { Art } from "@/components/brand/art";
import { Scene } from "@/components/brand/scene";
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
    <OnboardingFrame
      action={<SignInLink className="text-on-art hover:underline" />}
    >
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
 * known, a drawn learner for a child, and a scene for a tween, a teen or a
 * university learner, so no one sees a child's picture who is not one. The
 * scenes rest on the page's ground; the child's drawing has a ground of its
 * own, so its edges fade into the page.
 */
function Welcome({ band }: { band: AgeBand | null }) {
  return (
    <div className="hidden lg:sticky lg:top-24 lg:flex lg:h-[calc(100vh-8rem)] lg:flex-col lg:items-center lg:justify-center">
      {band === "child" ? (
        <div className="aspect-4/5 max-h-full w-full mask-x-from-85% mask-x-to-100% mask-y-from-88% mask-y-to-100%">
          <Art name="math" band={band} />
        </div>
      ) : (
        <Scene band={band} className="max-h-[72vh]" />
      )}
    </div>
  );
}
