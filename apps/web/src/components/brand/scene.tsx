import type { AgeBand } from "@/lib/age-band";
import { cn } from "@/lib/cn";
import { sceneImage } from "./scene-urls";

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
  const { src, width, height } = sceneImage(band);
  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("block h-auto max-h-full w-auto object-contain", className)}
    />
  );
}
