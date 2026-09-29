// The notices a parent is shown before agreeing, word for word as docs/API.md gives them.
// A consent names the version it was given for; only version 1 exists.

export const NOTICE_VERSION = 1;

export const SERVICE_NOTICE =
  "graspy teaches this learner with their name, class, language, questions, answers and voice. It sends them to Cloudflare, Amazon, Intron and Spitch to work. You can delete this learner and everything graspy keeps about them at any time.";

export const RETENTION_DAYS = [30, 90, 365] as const;
export type RetentionDays = (typeof RETENTION_DAYS)[number];

export const DEFAULT_RETENTION_DAYS: RetentionDays = 30;

export function recordingsNotice(days: RetentionDays): string {
  return `graspy will keep this learner's voice recordings for ${days} days so you can listen to them and delete them. They are sent to Intron and Cloudflare to check the answers. You can delete any recording, or stop keeping them, at any time.`;
}
