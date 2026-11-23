// Regenerates the small copies of the learner pictures: for each public/brand/art/<name>-<band>.webp
// (640 px) it writes <name>-<band>-160.webp and <name>-<band>-320.webp, which the Art component
// offers in `srcset` so a 48 px thumbnail does not load the full picture.
//
//   node apps/web/scripts/make-art-sizes.mjs
//
// Needs ImageMagick with WebP support (`magick`). /brand is cached by path (public/sw.js), so a
// changed picture needs a new file name: rename the 640 px file, and these follow its name.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const art = join(
  dirname(fileURLToPath(import.meta.url)),
  "../public/brand/art",
);
const WIDTHS = [160, 320];
const QUALITY = "80";
const PICTURE = /^[a-z]+-(child|tween|teen)\.webp$/;

for (const file of readdirSync(art).filter((name) => PICTURE.test(name))) {
  for (const width of WIDTHS) {
    const small = file.replace(/\.webp$/, `-${width}.webp`);
    execFileSync("magick", [
      join(art, file),
      "-resize",
      `${width}x${width}`,
      "-quality",
      QUALITY,
      join(art, small),
    ]);
  }
}
