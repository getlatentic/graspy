/** What this browser reports about itself and what it can do. Read-only; nothing is stored or sent. */
type Win = Window & typeof globalThis;

export interface Fact {
  name: string;
  value: string;
}

const media = (win: Win, query: string) => win.matchMedia(query).matches;

/** The first of the listed media-query values that matches, or "none matched". */
function mediaChoice(win: Win, feature: string, values: string[]): string {
  return values.find((v) => media(win, `(${feature}: ${v})`)) ?? "none matched";
}

export function environmentFacts(win: Win = window): Fact[] {
  const root = win.document.documentElement;
  return [
    { name: "User agent", value: win.navigator.userAgent },
    { name: "Window", value: `${win.innerWidth} x ${win.innerHeight}` },
    {
      name: "Screen",
      value: `${win.screen.width} x ${win.screen.height}`,
    },
    { name: "Pixel ratio", value: String(win.devicePixelRatio) },
    { name: "Root font size", value: win.getComputedStyle(root).fontSize },
    {
      name: "Orientation",
      value: media(win, "(orientation: portrait)") ? "portrait" : "landscape",
    },
    {
      name: "Pointer",
      value: mediaChoice(win, "pointer", ["fine", "coarse", "none"]),
    },
    {
      name: "Any pointer",
      value: mediaChoice(win, "any-pointer", ["fine", "coarse", "none"]),
    },
    { name: "Hover", value: mediaChoice(win, "hover", ["hover", "none"]) },
    {
      name: "Any hover",
      value: mediaChoice(win, "any-hover", ["hover", "none"]),
    },
    { name: "App marks device", value: root.dataset.device ?? "no" },
    { name: "Input mode", value: root.dataset.input ?? "pointer" },
  ];
}

function storageWorks(win: Win): boolean {
  try {
    return typeof win.localStorage.getItem === "function";
  } catch {
    return false;
  }
}

const supportsCss = (win: Win, query: string) =>
  typeof win.CSS?.supports === "function" && win.CSS.supports(query);

export function featureFacts(win: Win = window): Fact[] {
  const checks: [string, boolean][] = [
    ["fetch", typeof win.fetch === "function"],
    ["localStorage", storageWorks(win)],
    ["serviceWorker", "serviceWorker" in win.navigator],
    ["AudioContext", "AudioContext" in win || "webkitAudioContext" in win],
    ["wakeLock", "wakeLock" in win.navigator],
    ["MediaSource", "MediaSource" in win],
    ["AbortSignal.timeout", typeof win.AbortSignal?.timeout === "function"],
    ["structuredClone", typeof win.structuredClone === "function"],
    ["CSS container queries", supportsCss(win, "container-type: inline-size")],
    [":focus-visible", supportsCss(win, "selector(:focus-visible)")],
    [
      "getUserMedia",
      typeof win.navigator.mediaDevices?.getUserMedia === "function",
    ],
  ];
  return checks.map(([name, ok]) => ({ name, value: ok ? "yes" : "NO" }));
}
