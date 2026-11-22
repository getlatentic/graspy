import { describe, expect, it } from "vitest";

type Fs = {
  existsSync: (path: URL) => boolean;
  readdirSync: (path: URL, options: { recursive: true }) => string[];
  readFileSync: (path: URL, encoding: "utf8") => string;
};

// Vitest cannot import an image, so the files are looked for on disk. The module name is a
// variable so the browser tsconfig needs no node types.
async function fs(): Promise<Fs> {
  const fsModule = "node:fs";
  return import(/* @vite-ignore */ fsModule);
}

const SRC = new URL("../../", import.meta.url);
const THIS_FILE = "components/brand/ground-files.test.ts";

const DRAWN = [
  "ground-wide",
  "ground-tall",
  "scene-still-life",
  "scene-tween",
  "scene-desk",
  "hero-kids",
];

const REMOVED = [
  "/brand/desk.webp",
  "/brand/still-life.webp",
  "/brand/sign-in-landscape.webp",
  "/brand/art/tablet.webp",
];

describe("the art screens' pictures", () => {
  it("are all in public/brand/art", async () => {
    const { existsSync } = await fs();
    const missing = DRAWN.filter(
      (name) =>
        !existsSync(
          new URL(`../../../public/brand/art/${name}.webp`, import.meta.url),
        ),
    );
    expect(missing).toEqual([]);
  });

  it("leave no reference to a removed file", async () => {
    const { readdirSync, readFileSync } = await fs();
    const sources = readdirSync(SRC, { recursive: true }).filter(
      (path) => /\.(tsx?|css|json)$/.test(path) && path !== THIS_FILE,
    );
    const found = sources.flatMap((path) => {
      const text = readFileSync(new URL(path, SRC), "utf8");
      return REMOVED.filter((file) => text.includes(file)).map(
        (file) => `${path}: ${file}`,
      );
    });
    expect(found).toEqual([]);
  });
});
