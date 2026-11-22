/** What a television's browser names itself. A bare brand (Philips, Hisense, Roku) is not here: they make tablets and phones too. */
const TV_AGENT =
  /Tizen|Web0S|WebOS|SmartTV|SMART-TV|GoogleTV|Google TV|AFT[A-Z]|Aquos|BRAVIA|NetCast|HbbTV|CrKey|Roku\/DVP|Viera|VIDAA|NETTV|Philips.*(SmartTV|NETTV)/i;

const OVERRIDE = "graspy.tv";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Whether the page is shown on a television. A width cannot tell a TV from a
 * monitor, so the user agent decides, unless the person says otherwise:
 * `?tv=1` forces it on, `?tv=0` forces it off (on a real TV too) and `?tv=auto`
 * goes back to the user agent. The choice is kept, for testing on a desktop.
 */
export function isTelevision(
  userAgent: string,
  search: string,
  store: Store | null,
): boolean {
  const asked = new URLSearchParams(search).get("tv");
  let kept: string | null = null;
  try {
    if (asked === "1" || asked === "0") store?.setItem(OVERRIDE, asked);
    else if (asked === "auto") store?.removeItem(OVERRIDE);
    kept = store?.getItem(OVERRIDE) ?? null;
  } catch {
    kept = null;
  }
  const choice = asked === "1" || asked === "0" ? asked : kept;
  if (choice === "1") return true;
  if (choice === "0") return false;
  return TV_AGENT.test(userAgent);
}

/** The page's storage, or null where reading it throws (blocked site data). */
function pageStorage(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Puts the device on the page for the stylesheet: `<html data-device="tv">`. */
export function markDevice(): void {
  if (isTelevision(navigator.userAgent, location.search, pageStorage())) {
    document.documentElement.dataset.device = "tv";
  }
}
