import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";

// The link takes the room of its text and nothing more, so the spacing around
// it is the page's own. Its 2.75rem touch target is the pseudo-element, 0.75rem
// above and below the text: it takes no layout room, and it stays inside the
// gap the page keeps between the link and what follows (never under 0.75rem).
const STYLE =
  "relative inline-flex items-center gap-1.5 self-start rounded-control text-sm font-medium text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']";

type BackLinkProps = { children: ReactNode; className?: string } & (
  { to: string; onClick?: never } | { onClick: () => void; to?: never }
);

/** The arrow every way back is drawn with: it turns with the writing direction. */
export function BackArrow({ className }: { className: string }) {
  return (
    <ArrowLeft className={cn("rtl:rotate-180", className)} aria-hidden="true" />
  );
}

/** The "Back to ..." link every page opens with: an arrow that turns with the writing direction, then the label. */
export function BackLink({ children, className, to, onClick }: BackLinkProps) {
  const content = (
    <>
      <BackArrow className="size-4 shrink-0" />
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
