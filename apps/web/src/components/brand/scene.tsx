import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { sceneUrl } from "./scene-urls";

/** A picture with a transparent ground: it rests directly on the page. */
export function Scene({
  band,
  eager = false,
  className,
}: {
  band: AgeBand | null;
  eager?: boolean;
  className?: string;
}) {
  return (
    <img
      src={sceneUrl(band)}
      alt=""
      width={900}
      height={1125}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("block h-auto max-h-full w-auto object-contain", className)}
    />
  );
}
