#!/usr/bin/env node
// Copies the libraries the tutor's replies are drawn with into the app, from the repository's own
// node_modules, with their licences. Run from the repository root after `npm install`:
//   node apps/mobile/scripts/vendor-reply.mjs
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MODULES = join(ROOT, "node_modules");
const OUT = join(ROOT, "apps/mobile/app/src/main/assets/app-host/vendor");

const copies = [
  ["marked/lib/marked.umd.js", "marked.umd.js"],
  ["marked/LICENSE.md", "marked-LICENSE.md"],
  ["katex/dist/katex.min.js", "katex.min.js"],
  ["katex/dist/katex.min.css", "katex.min.css"],
  ["katex/LICENSE", "katex-LICENSE.txt"],
  ["@fontsource/inter/LICENSE", "inter-OFL.txt"],
  ...["latin", "latin-ext"].flatMap((range) =>
    [400, 600].map((weight) => [
      `@fontsource/inter/files/inter-${range}-${weight}-normal.woff2`,
      `fonts/inter-${range}-${weight}-normal.woff2`,
    ]),
  ),
  // KaTeX's stylesheet asks for its fonts beside it; woff2 is all a WebView needs.
  ...readdirSync(join(MODULES, "katex/dist/fonts"))
    .filter((name) => name.endsWith(".woff2"))
    .map((name) => [`katex/dist/fonts/${name}`, `fonts/${name}`]),
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "fonts"), { recursive: true });
for (const [from, to] of copies) copyFileSync(join(MODULES, from), join(OUT, to));
console.log(`copied ${copies.length} files into ${OUT}`);
