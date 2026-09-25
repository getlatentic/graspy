import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

interface HomeSectionProps {
  title: string;
  more?: { label: string; to: string };
  children: ReactNode;
  className?: string;
}

export function HomeSection({
  title,
  more,
  children,
  className,
}: HomeSectionProps) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-sans text-base font-semibold text-ink">{title}</h2>
        {more && (
          <Link
            to={more.to}
            className="inline-flex items-center gap-0.5 text-sm font-medium text-accent-ink hover:underline"
          >
            {more.label}
            <ChevronRight
              className="size-4 rtl:rotate-180"
              aria-hidden="true"
            />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
