# CSS cascade layers: Tailwind 4 + Carbon

Carbon emits its CSS inside a cascade layer, so app styles and Tailwind utilities
override Carbon by layer position, not by selector weight.

## Layer order

`src/styles/index.css` owns the order. It does not use `@import "tailwindcss"`;
it inlines that import's expansion so `carbon` can sit between `base` and
`components`:

```css
@layer theme, base, carbon, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities);

@import "./theme.css" layer(components);
```

Precedence, lowest to highest:

```
theme < base (preflight) < carbon < components (app) < utilities
```

- Carbon wins over Preflight by layer order, so Carbon's own resets stay off.
- App component CSS beats Carbon by position.
- Tailwind utilities beat everything, including Carbon components.

## Carbon inside its layer

`src/styles/carbon.scss` configures Carbon with top-level `@use` (Sass requires
`@use` before any CSS) and emits each component module inside `@layer carbon`
with `meta.load-css`. `theme.theme()` emits the complete Carbon white theme, so
no component state falls back to an IBM default. Brand `--cds-*` overrides live in
`theme.css`, in `layer(components)`, and win by layer order. A token that should
differ from Carbon points at a graspy token; a token that should not differ is
not overridden.

## Load-order invariant

The browser fixes a layer's position at its first mention. If a feature
stylesheet (`@layer components { … }`) loads before the layer-order statement,
`components` becomes the lowest layer and Preflight beats app styles (headings
collapse to 16px while other declarations in the same rule still apply). So
`import "./styles/index.css"` is the first import of every entry module:
`main.tsx` and each `src/test/visual/*.tsx`.

## Rules

1. App CSS lives in `@layer components`; components style themselves with
   utilities. Unlayered CSS would out-rank utilities.
2. The one unlayered import is KaTeX's stylesheet, from `main.tsx`; it styles
   only `.katex` elements. Fonts are declared in `fonts.css` from the bundled
   `@fontsource` files, so the interface never loads a font from the network.
3. Button appearance is decided once, in `theme.css`. Carbon reserves 63px of
   right padding for a trailing icon, so an icon-less button gets symmetric
   padding together with its centred label.

## rem policy

Carbon v11 sizes type, spacing and component heights in `rem` against a 16px
root, and Tailwind utilities are rem-based too.

- `html { font-size }` stays at 100%.
- App tokens and feature CSS use `rem`; hairlines and borders may use `px`.
- Print styles may use physical units; screen styles may not.
