import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { artUrl, type ArtName } from "./art-urls";

/** A learner picture that fills its box; an `object-*` class picks the part kept when the box is not square. */
export function Art({
  name,
  band = "child",
  className,
  eager = false,
}: {
  name: ArtName;
  band?: AgeBand;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={artUrl(name, band)}
      alt=""
      width={640}
      height={640}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("block size-full object-cover", className)}
    />
  );
}
