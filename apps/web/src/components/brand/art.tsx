import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { artSrcSet, artUrl, type ArtName } from "./art-urls";

/**
 * A learner picture that fills its box; an `object-*` class picks the part kept when the box is not
 * square. `sizes` is the width the picture is shown at, in px at the default root size (the
 * browser reads rem in `sizes` against that size, not the page's); with it the browser loads the
 * smallest copy that is sharp, without it the full picture. `priority` is for the largest paint on
 * a page: it loads at once and ahead of the page's other images.
 */
export function Art({
  name,
  band = "child",
  className,
  eager = false,
  priority = false,
  sizes,
}: {
  name: ArtName;
  band?: AgeBand;
  className?: string;
  eager?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <img
      src={artUrl(name, band)}
      srcSet={sizes ? artSrcSet(name, band) : undefined}
      sizes={sizes}
      alt=""
      width={640}
      height={640}
      loading={eager || priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("block size-full object-cover", className)}
    />
  );
}
