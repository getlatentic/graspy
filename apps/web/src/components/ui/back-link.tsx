import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";

// Padding makes the hit target 2.75rem tall, and the negative margin gives the
// room back, so the link's text and arrow stay on the page column's edge.
const STYLE =
  "-my-3 inline-flex items-center gap-1.5 self-start rounded-control py-3 text-sm font-medium text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type BackLinkProps = { children: ReactNode; className?: string } & (
  { to: string; onClick?: never } | { onClick: () => void; to?: never }
);

/** The "Back to ..." link every page opens with: an arrow that turns with the writing direction, then the label. */
export function BackLink({ children, className, to, onClick }: BackLinkProps) {
  const content = (
    <>
      <ArrowLeft
        className="size-4 shrink-0 rtl:rotate-180"
        aria-hidden="true"
      />
      {children}
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} className={cn(STYLE, className)}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(STYLE, className)}>
      {content}
    </button>
  );
}
