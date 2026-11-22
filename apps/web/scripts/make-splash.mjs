// Regenerates public/brand/splash/*.png, the launch images iOS shows while an installed app
// starts (it ignores the manifest for this), and prints the <link> tags for index.html.
//
//   node apps/web/scripts/make-splash.mjs [png|jpg]
//
// Composes the supplied art only: the gradient (brand/art/ground-tall.webp upright,
// ground-wide.webp sideways) scaled and cropped to cover the screen, and brand/sprout.svg
// centred on it. Needs ImageMagick (`magick`) and librsvg (`rsvg-convert`) on the PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const brand = join(dirname(fileURLToPath(import.meta.url)), "../public/brand");
const out = join(brand, "splash");
const format = process.argv[2] === "jpg" ? "jpg" : "png";

// Apple's device table: CSS width, height (upright) and pixel ratio.
const IPHONES = [
  [440, 956, 3],
  [430, 932, 3],
  [428, 926, 3],
  [420, 912, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [402, 874, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [375, 667, 2],
  [320, 568, 2],
];
const IPADS = [
  [1032, 1376, 2],
  [1024, 1366, 2],
  [834, 1210, 2],
  [834, 1194, 2],
  [834, 1112, 2],
  [820, 1180, 2],
  [810, 1080, 2],
  [768, 1024, 2],
];

// The sprout's drawn extent inside its 24-unit viewBox, and how much of the short side it fills.
const BOX = { width: 17.2, height: 17.3, centreX: 12, centreY: 13.35 };
const SHORT_SIDE_SHARE = 0.18;

const screens = [
  ...IPHONES.map(([w, h, ratio]) => ({ w, h, ratio, landscape: false })),
  ...IPADS.flatMap(([w, h, ratio]) => [
    { w, h, ratio, landscape: false },
    { w: h, h: w, ratio, landscape: true },
  ]),
];

const run = (command, args) => execFileSync(command, args);
const nameOf = ({ w, h, ratio }) => `${w * ratio}x${h * ratio}.${format}`;

mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "splash-"));
try {
  const links = [];
  for (const screen of screens) {
    const width = screen.w * screen.ratio;
    const height = screen.h * screen.ratio;
    const unit = (Math.min(width, height) * SHORT_SIDE_SHARE) / BOX.width;
    const size = Math.round(24 * unit);
    const sprout = join(work, "sprout.png");
    run("rsvg-convert", [
      "-w",
      String(size),
      "-h",
      String(size),
      join(brand, "sprout.svg"),
      "-o",
      sprout,
    ]);
    const left = Math.round(width / 2 - BOX.centreX * unit);
    const top = Math.round(height / 2 - BOX.centreY * unit);
    const art = join(
      brand,
      "art",
      screen.landscape ? "ground-wide.webp" : "ground-tall.webp",
    );
    const file = join(out, nameOf(screen));
    const encode =
      format === "jpg"
        ? ["-strip", "-interlace", "Plane", "-quality", "70", `JPEG:${file}`]
        : ["-strip", "-define", "png:compression-level=9", `PNG24:${file}`];
    run("magick", [
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
      `+${left}+${top}`,
      "-composite",
      ...encode,
    ]);
    const orientation = screen.landscape ? "landscape" : "portrait";
    links.push(
      `    <link rel="apple-touch-startup-image" href="/brand/splash/${nameOf(screen)}" media="(device-width: ${screen.landscape ? screen.h : screen.w}px) and (device-height: ${screen.landscape ? screen.w : screen.h}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: ${orientation})" />`,
    );
  }
  console.log(links.join("\n"));
  const bytes = screens.reduce(
    (sum, s) => sum + statSync(join(out, nameOf(s))).size,
    0,
  );
  console.error(`${screens.length} images, ${(bytes / 1024).toFixed(0)} KB`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
