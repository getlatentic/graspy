export const CONTACT_EMAIL = "hello@getlatentic.com";

export function contactHref(subject?: string): string {
  const query = subject
    ? `?subject=${encodeURIComponent(`graspy: ${subject}`)}`
    : "";
  return `mailto:${CONTACT_EMAIL}${query}`;
}

export const PAGE =
  "mx-auto w-full max-w-5xl px-[max(1.25rem,var(--page-gutter))] sm:px-[max(2rem,var(--page-gutter))]";
