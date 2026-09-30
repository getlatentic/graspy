import type { Page } from "playwright-core";
import type { PageStrings } from "./strings.ts";

/** From Home to a voice lesson: the one named, or the one the teacher marks as where to start. */
export async function openLesson(page: Page, webUrl: string, strings: PageStrings, title: string | null): Promise<void> {
  await page.goto(`${webUrl}/app/learn/voice`);
  const link = title
    ? page.getByRole("link", { name: title })
    : page.getByRole("link").filter({ hasText: /Start here/i });
  await link.first().waitFor({ timeout: 60_000 });
  await link.first().click();
  const ok = page.getByRole("button", { name: strings.ok, exact: true });
  await ok.waitFor({ timeout: 10_000 }).then(() => ok.click(), () => undefined);
}
