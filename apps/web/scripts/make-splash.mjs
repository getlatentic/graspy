// Regenerates the launch images iOS shows while an installed app starts (it ignores the
// manifest for this): public/brand/splash/*.jpg, and the <link> tags in index.html between
// <!-- splash:start --> and <!-- splash:end -->.
//
//   node apps/web/scripts/make-splash.mjs
//
// Composes the supplied art only: the gradient (brand/art/ground-tall.webp upright,
// ground-wide.webp sideways) scaled and cropped to cover the screen, and brand/sprout.svg
// centred on it. Needs ImageMagick with WebP support (`magick`) and librsvg (`rsvg-convert`).
// /brand is cached by path (public/sw.js), so a changed image needs a new file name.
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(web, "public/brand");
const out = join(brand, "splash");
const START = "<!-- splash:start -->";
const END = "<!-- splash:end -->";

// Apple's device table: CSS width, height (upright) and pixel ratio.
const IPHONES = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [430, 932, 3], // 14 Plus to 16 Plus, 14 Pro Max, 15 Pro Max
  [428, 926, 3], // 12 Pro Max, 13 Pro Max, 14 Plus
  [420, 912, 3], // 17 Air
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6 Plus to 8 Plus
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [390, 844, 3], // 12, 13, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro
  [375, 667, 2], // 6 to 8, SE 2 and 3
  [360, 780, 3], // 12 mini, 13 mini
  [320, 568, 2], // 5s, SE 1
];
const IPADS = [
  [1032, 1376, 2], // Pro 13 (M4), Air 13 (M2)
  [1024, 1366, 2], // Pro 12.9
  [834, 1210, 2], // Pro 11 (M4)
  [834, 1194, 2], // Pro 11
  [834, 1112, 2], // Pro 10.5, Air 3
  [820, 1180, 2], // 10th gen, Air 4 and 5, Air 11 (M2)
  [810, 1080, 2], // 7th to 9th gen
  [768, 1024, 2], // 5th and 6th gen, mini 4 and 5
  [744, 1133, 2], // mini 6 and 7
];

// The sprout's drawn extent inside its 24-unit viewBox, and how much of the short side it fills.
const BOX = { width: 17.2, centreX: 12, centreY: 13.35 };
const SHORT_SIDE_SHARE = 0.18;
const QUALITY = "70";
// Raise it when the art or the mark changes: /brand is cached by path.
const VERSION = 1;

const screens = [
  ...IPHONES.map(([w, h, ratio]) => ({ w, h, ratio, landscape: false })),
  ...IPADS.flatMap(([w, h, ratio]) => [
    { w, h, ratio, landscape: false },
    { w: h, h: w, ratio, landscape: true },
  ]),
];

function need(command, args, hint) {
  try {
    return execFileSync(command, args, { encoding: "utf8" });
  } catch {
    console.error(`${command} is needed: ${hint}`);
    process.exit(1);
  }
}

function checkTools() {
  const formats = need("magick", ["-list", "format"], "install ImageMagick.");
  if (!/^\s*WEBP\b/m.test(formats)) {
    console.error(
      "magick has no WebP support: reinstall ImageMagick with libwebp.",
    );
    process.exit(1);
  }
  need("rsvg-convert", ["--version"], "install librsvg.");
}

const nameOf = ({ w, h, ratio }) => `${w * ratio}x${h * ratio}-v${VERSION}.jpg`;

function linkOf(screen) {
  // The media query names the screen upright, as Safari reports it, whichever way it is held.
  const [across, down] = screen.landscape
    ? [screen.h, screen.w]
    : [screen.w, screen.h];
  const orientation = screen.landscape ? "landscape" : "portrait";
  return `    <link rel="apple-touch-startup-image" href="/brand/splash/${nameOf(screen)}" media="(device-width: ${across}px) and (device-height: ${down}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: ${orientation})" />`;
}

function render(screen, work) {
  const width = screen.w * screen.ratio;
  const height = screen.h * screen.ratio;
  const unit = (Math.min(width, height) * SHORT_SIDE_SHARE) / BOX.width;
  const size = Math.round(24 * unit);
  const sprout = join(work, "sprout.png");
  execFileSync("rsvg-convert", [
    "-w",
    String(size),
    "-h",
    String(size),
    join(brand, "sprout.svg"),
    "-o",
    sprout,
  ]);
  const art = join(
    brand,
    "art",
    screen.landscape ? "ground-wide.webp" : "ground-tall.webp",
  );
  execFileSync("magick", [
    art,
    // The art is a smooth gradient with a little grain; without the grain it encodes in a
    // fraction of the bytes, and a screen this big shows no difference.
    "-resize",
    "10%",
    "-filter",
    "Mitchell",
    "-resize",
    `${width}x${height}^`,
    "-gravity",
    "center",
    "-extent",
    `${width}x${height}`,
    "-gravity",
    "northwest",
    sprout,
    "-geometry",
    `+${Math.round(width / 2 - BOX.centreX * unit)}+${Math.round(height / 2 - BOX.centreY * unit)}`,
    "-composite",
    "-strip",
    "-interlace",
    "Plane",
    "-quality",
    QUALITY,
    `JPEG:${join(out, nameOf(screen))}`,
  ]);
}

function writeLinks() {
  const path = join(web, "index.html");
  const html = readFileSync(path, "utf8");
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) {
    console.error(`index.html needs ${START} and ${END} where the links go.`);
    process.exit(1);
  }
  const block = screens.map(linkOf).join("\n");
  writeFileSync(
    path,
    `${html.slice(0, start + START.length)}\n${block}\n    ${html.slice(end)}`,
  );
}

checkTools();
mkdirSync(out, { recursive: true });
const wanted = new Set(screens.map(nameOf));
for (const file of readdirSync(out)) {
  if (!wanted.has(file)) rmSync(join(out, file));
}
const work = mkdtempSync(join(tmpdir(), "splash-"));
try {
  for (const screen of screens) render(screen, work);
} finally {
  rmSync(work, { recursive: true, force: true });
}
writeLinks();
const bytes = screens.reduce(
  (sum, s) => sum + statSync(join(out, nameOf(s))).size,
  0,
);
console.log(`${screens.length} images, ${(bytes / 1024).toFixed(0)} KB`);
