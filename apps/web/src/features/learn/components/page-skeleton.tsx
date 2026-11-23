import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { AgeBand } from "@/lib/age-band";
import { useAgeBand } from "@/lib/use-age-band";
import { HOME_GRID } from "@/features/learn/lib/home-grid";
import type { PageShape } from "@/features/learn/lib/app-sections";

// Each skeleton is drawn with the sizes of the page it stands for (app/learn/page.tsx,
// subject-page.tsx), so the page fills in without moving.

function SectionTitle() {
  return <Skeleton className="mb-3 h-6 w-40" />;
}

function ResumeSkeleton({ band }: { band: AgeBand }) {
  return (
    <Card className="p-3 sm:p-6">
      <div className="flex items-center gap-3 sm:items-start sm:gap-5">
        <Skeleton
          className={cn(
            "shrink-0 rounded-card",
            band === "teen"
              ? "size-12 sm:size-16 lg:size-20"
              : "size-16 sm:size-24 lg:size-32",
          )}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4 sm:h-7" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-2.5 w-full rounded-full sm:h-3" />
        </div>
        <Skeleton className="h-9 w-20 shrink-0 rounded-full sm:hidden" />
      </div>
      <Skeleton className="mt-4 hidden h-14 w-56 rounded-full sm:block" />
    </Card>
  );
}

function TileSkeleton({ band }: { band: AgeBand }) {
  if (band === "teen") {
    return (
      <Card className="flex items-center gap-3 p-3">
        <Skeleton className="size-12 shrink-0" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <Skeleton
        className={cn(
          "w-full rounded-none",
          band === "child" ? "aspect-4/3" : "aspect-video",
        )}
      />
      <div className="px-3 py-3">
        <Skeleton className="h-5 w-2/3" />
      </div>
    </Card>
  );
}

function HomeSkeleton({ band }: { band: AgeBand }) {
  return (
    <div className={HOME_GRID}>
      <Skeleton className="h-9 w-2/3 max-w-sm lg:col-span-2 lg:h-10" />
      <div className="flex min-w-0 flex-col gap-8 lg:gap-6">
        <section>
          <SectionTitle />
          <ResumeSkeleton band={band} />
        </section>
        <section>
          <SectionTitle />
          <ul
            className={cn(
              "grid grid-cols-2 gap-3",
              band === "teen"
                ? "lg:grid-cols-2 2xl:grid-cols-4"
                : "sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4",
            )}
          >
            {[0, 1, 2, 3].map((tile) => (
              <li key={tile}>
                <TileSkeleton band={band} />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Card className="hidden h-72 flex-col gap-6 lg:flex">
        {[0, 1, 2].map((block) => (
          <div key={block} className="space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function SubjectSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Skeleton className="h-6 w-24" />
        <div className="mt-4 flex items-center gap-3">
          <Skeleton className="size-14 shrink-0 sm:size-16" />
          <Skeleton className="h-8 w-48 sm:h-9" />
        </div>
      </div>
      <Skeleton className="h-9 w-full" />
      <ul className="space-y-2">
        {[0, 1, 2, 3, 4].map((row) => (
          <li key={row}>
            <Skeleton className="h-16 w-full rounded-card" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-9 w-1/2" />
      <ul className="space-y-3">
        {[0, 1, 2].map((row) => (
          <li key={row}>
            <Skeleton className="h-20 w-full rounded-card" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What a learn page shows while the learner's plan is read, in the shape of that page. */
export function PageSkeleton({ shape }: { shape: PageShape }) {
  const band = useAgeBand();
  if (shape === "home") return <HomeSkeleton band={band} />;
  if (shape === "subject") return <SubjectSkeleton />;
  return <ListSkeleton />;
}
