import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { MICROPHONE_SCRIPT } from "./microphone.ts";

/**
 * A phone-sized page, as a child would hold it, with the simulated microphone installed.
 * A device saved after onboarding is restored, so a run does not pay for a new plan.
 */
export async function openChild(savedDevice: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({
    viewport: { width: 402, height: 860 },
    permissions: ["microphone"],
    ...(existsSync(savedDevice) ? { storageState: savedDevice } : {}),
  });
  await context.addInitScript(MICROPHONE_SCRIPT);
  return { browser, context };
}
