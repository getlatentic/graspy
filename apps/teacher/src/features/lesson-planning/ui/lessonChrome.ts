/**
 * The lesson screens' shared shell, as utility strings: one width, one heading
 * row, one display title — so five screens cannot drift apart by restating them.
 */
export const editorWorkspace =
  "mx-auto min-h-full w-[min(100%,88rem)] px-lg pt-xl pb-3xl";

export const workspaceHeading =
  "mb-xl flex flex-col items-start gap-lg sm:flex-row sm:justify-between";

/** Large display is Light 300 per the brand, not the bold of smaller headings. */
export const displayTitle =
  "m-0 font-display text-display font-light leading-display tracking-[-0.01em] text-ink";

export const headingIntro = "m-0 mt-sm text-ink-secondary";

export const editorActions = "flex flex-wrap gap-sm";

export const sourcePlanAside = "grid gap-2xs border-s-2 border-accent ps-md";
export const sourcePlanLabel = "text-sm font-bold text-muted";
