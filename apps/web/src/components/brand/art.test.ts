import { describe, expect, it } from "vitest";
import type { AgeBand } from "@/lib/age-band";
import { ART_NAMES, artSizes, artSrcSet, artUrl } from "./art-urls";

const BANDS: AgeBand[] = ["child", "tween", "teen"];

type Exists = (path: URL) => boolean;

// Vitest cannot import an image, so the files are looked for on disk. The module name is a
// variable so the browser tsconfig needs no node types.
async function exists(url: string): Promise<boolean> {
  const fsModule = "node:fs";
  const { existsSync }: { existsSync: Exists } = await import(
    /* @vite-ignore */ fsModule
  );
  return existsSync(new URL(`../../../public${url}`, import.meta.url));
}

describe("artUrl", () => {
  it("names a picture per subject and age band", () => {
    expect(artUrl("math", "tween")).toBe("/brand/art/math-tween.webp");
  });

  it("has a file for every subject and band", async () => {
    const urls = ART_NAMES.flatMap((name) =>
      BANDS.map((band) => artUrl(name, band)),
    );
    const missing: string[] = [];
    for (const url of new Set(urls)) {
      if (!(await exists(url))) missing.push(url);
    }
    expect(missing).toEqual([]);
  });

  it("has every small copy its srcset names (node scripts/make-art-sizes.mjs)", async () => {
    const urls = ART_NAMES.flatMap((name) =>
      BANDS.flatMap((band) =>
        artSrcSet(name, band)
          .split(", ")
          .map((candidate) => candidate.split(" ")[0]),
      ),
    );
    const missing: string[] = [];
    for (const url of new Set(urls)) {
      if (!(await exists(url))) missing.push(url);
    }
    expect(missing).toEqual([]);
  });
});

describe("artSizes", () => {
  it("writes a width in rem from the page's root size, for each orientation", () => {
    expect(artSizes([{ rem: 3 }, { from: 40, rem: 4 }])).toBe(
      [
        "(orientation: portrait) and (min-width: 40rem) calc(4 * max(1rem, min(1.0417vh, 1.8519vw)))",
        "(min-width: 40rem) calc(4 * max(1rem, min(1.0417vw, 1.8519vh)))",
        "(orientation: portrait) calc(3 * max(1rem, min(1.0417vh, 1.8519vw)))",
        "calc(3 * max(1rem, min(1.0417vw, 1.8519vh)))",
      ].join(", "),
    );
  });

  it("writes a width in vw as it is, widest breakpoint first", () => {
    expect(artSizes([{ vw: 45 }, { from: 64, vw: 27 }])).toBe(
      "(min-width: 64rem) 27vw, 45vw",
    );
  });
});

describe("artSrcSet", () => {
  it("lists the small copies and then the full picture, by width", () => {
    expect(artSrcSet("math", "child")).toBe(
      "/brand/art/math-child-160.webp 160w, /brand/art/math-child-320.webp 320w, /brand/art/math-child.webp 640w",
    );
  });
});
