const TV_AGENT =
  /Tizen|Web0S|WebOS|SmartTV|SMART-TV|GoogleTV|Google TV|AFTT|AFTM|AFTS|Aquos|BRAVIA|NetCast|HbbTV|CrKey|Roku|Viera|Philips|Hisense|Vidaa|VIDAA/i;

const OVERRIDE = "graspy.tv";

/**
 * Whether the page is shown on a television. A width cannot tell a TV from a
 * monitor, so the user agent decides; `?tv=1` forces it on and `?tv=0` off, and
 * the choice is kept for testing on a desktop.
 */
export function isTelevision(
  userAgent: string,
  search: string,
  store: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): boolean {
  const asked = new URLSearchParams(search).get("tv");
  try {
    if (asked === "1") store.setItem(OVERRIDE, "1");
    else if (asked === "0") store.removeItem(OVERRIDE);
    if (store.getItem(OVERRIDE) === "1") return true;
  } catch {
    if (asked === "1") return true;
  }
  return TV_AGENT.test(userAgent);
}

/** Puts the device on the page for the stylesheet: `<html data-device="tv">`. */
export function markDevice(): void {
  if (isTelevision(navigator.userAgent, location.search, localStorage)) {
    document.documentElement.dataset.device = "tv";
  }
}
