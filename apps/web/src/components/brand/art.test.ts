import { describe, expect, it } from "vitest";
import type { AgeBand } from "@/lib/age-band";
import { ART_NAMES, artUrl } from "./art-urls";

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
});
