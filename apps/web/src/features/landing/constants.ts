export const CONTACT_EMAIL = "hello@getlatentic.com";

export function contactHref(subject?: string): string {
  const query = subject
    ? `?subject=${encodeURIComponent(`graspy: ${subject}`)}`
    : "";
  return `mailto:${CONTACT_EMAIL}${query}`;
}

export const PAGE = "mx-auto w-full max-w-5xl px-5 sm:px-8";
