import { cn } from "@/lib/cn";

/** The learner pictures, one per scene. */
const ART = {
  tablet: "/brand/art/tablet.webp",
  math: "/brand/art/math.webp",
  science: "/brand/art/science.webp",
  english: "/brand/art/english.webp",
  ict: "/brand/art/ict.webp",
  history: "/brand/art/history.webp",
  geography: "/brand/art/geography.webp",
  music: "/brand/art/music.webp",
  art: "/brand/art/art.webp",
  pe: "/brand/art/pe.webp",
  agriculture: "/brand/art/agriculture.webp",
  business: "/brand/art/business.webp",
  civic: "/brand/art/civic.webp",
} as const;

export type ArtName = keyof typeof ART;

/** A learner picture that fills its box; an `object-*` class picks the part kept when the box is not square. */
export function Art({
  name,
  className,
  eager = false,
}: {
  name: ArtName;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={ART[name]}
      alt=""
      width={640}
      height={640}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("block size-full object-cover", className)}
    />
  );
}
