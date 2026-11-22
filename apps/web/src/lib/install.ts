// Putting graspy on a phone's Home Screen. Chrome and Edge offer it on request: they fire
// "beforeinstallprompt" once, early, and the event is kept until the learner asks. Safari
// on iOS has no such event; the only way is Share, then Add to Home Screen, so the app says so.

export const INSTALL_DISMISSED_KEY = "graspy_install_dismissed";

/** Chrome's install event, which TypeScript's DOM types do not include. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** What the app can show: a button that installs, steps for the learner to follow, or nothing. */
export type InstallOffer = "prompt" | "steps" | null;

export interface Device {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

/** Safari, and browsers built on it, on an iPhone or iPad; not a web view inside another app,
 * which has no Share sheet with Add to Home Screen. */
export function isIosBrowser({
  userAgent,
  platform,
  maxTouchPoints,
}: Device): boolean {
  // iPadOS asks for desktop sites by default and calls itself a Mac with a touch screen.
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  return ios && /Safari\//.test(userAgent);
}

export function offerFor(state: {
  installed: boolean;
  dismissed: boolean;
  hasPrompt: boolean;
  iosBrowser: boolean;
}): InstallOffer {
  if (state.installed || state.dismissed) return null;
  if (state.hasPrompt) return "prompt";
  return state.iosBrowser ? "steps" : null;
}

function isInstalled(): boolean {
  const standalone = (navigator as { standalone?: boolean }).standalone;
  return (
    standalone === true || matchMedia("(display-mode: standalone)").matches
  );
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

let prompt: InstallPromptEvent | null = null;
let dismissed = false;
let current: InstallOffer = null;
const listeners = new Set<() => void>();

function recompute(): void {
  const offer = offerFor({
    installed: isInstalled(),
    dismissed,
    hasPrompt: prompt !== null,
    iosBrowser: isIosBrowser(navigator),
  });
  if (offer === current) return;
  current = offer;
  for (const listener of listeners) listener();
}

/** Starts at page load, because the browser fires the event once, before the app has drawn. */
export function listenForInstall(): void {
  dismissed = wasDismissed();
  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this Chrome shows its own bar; the app offers the install itself.
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    recompute();
  });
  window.addEventListener("appinstalled", () => {
    prompt = null;
    recompute();
  });
  recompute();
}

export function subscribeToInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installOffer(): InstallOffer {
  return current;
}

/** Not asked again on this device. It is the device's, not a learner's: it survives a switch of learner. */
export function dismissInstall(): void {
  dismissed = true;
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    // Storage refused: it is asked again next visit.
  }
  recompute();
}

/** Opens the browser's own install dialog; whatever the learner chooses, it is not offered again. */
export async function install(): Promise<void> {
  const event = prompt;
  if (!event) return;
  // The event can be used once.
  prompt = null;
  try {
    await event.prompt();
    await event.userChoice;
  } finally {
    dismissInstall();
  }
}
