/**
 * Class combinations every screen shares, wherever it lives.
 *
 * These are not tokens — the tokens are in `styles/index.css` under `@theme`,
 * and these are the handful of combinations that recur across features. They
 * sit outside `features/` because a screen in any feature sets them, and the
 * one that lived in `academic-workspace` was written out longhand nineteen
 * times elsewhere rather than imported across that boundary.
 */

/** The eyebrow line a screen sets above its title. */
export const eyebrow = "m-0 mb-xs text-sm font-extrabold tracking-[0.01em] text-accent";
