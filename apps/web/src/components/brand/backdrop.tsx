/** The sky behind an art screen: a tall one for a phone, a wide one from 1024px. It fills the nearest positioned ancestor. */
export function Backdrop() {
  return (
    <div className="absolute inset-0 -z-10" aria-hidden="true">
      <picture>
        <source
          media="(min-width: 64rem)"
          srcSet="/brand/backdrop-landscape.webp"
        />
        <img
          src="/brand/backdrop-portrait.webp"
          alt=""
          width={720}
          height={1520}
          decoding="async"
          className="size-full object-cover"
        />
      </picture>
    </div>
  );
}
