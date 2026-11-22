/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";

const SPLASH_DIR = new URL("../../public/brand/splash/", import.meta.url);
const files = Object.keys(
  import.meta.glob("../../public/brand/splash/*.jpg"),
).map((path) => path.split("/").pop()!);

const read = (media: string, name: string) =>
  media.match(new RegExp(`\\(${name}: ([\\w.]+?)(?:px)?\\)`))?.[1];

const links = [
  ...indexHtml.matchAll(
    /<link rel="apple-touch-startup-image" href="\/brand\/splash\/([^"]+)" media="([^"]+)"/g,
  ),
].map(([, file, media]) => ({
  file,
  across: Number(read(media, "device-width")),
  down: Number(read(media, "device-height")),
  ratio: Number(read(media, "-webkit-device-pixel-ratio")),
  orientation: read(media, "orientation"),
}));

/** The pixel size a JPEG declares, from its first start-of-frame marker. */
function jpegSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(new URL(file, SPLASH_DIR));
  let at = 2;
  while (at < bytes.length) {
    const marker = bytes[at + 1];
    // SOF0 to SOF15, but not the table markers DHT, JPG and DAC among them.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: bytes.readUInt16BE(at + 5),
        width: bytes.readUInt16BE(at + 7),
      };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  throw new Error(`${file} has no frame header`);
}

// Every phone and tablet Apple sells or still supports, as Safari reports it: CSS size upright
// and pixel ratio. iPhones are held upright; iPads either way.
const IPHONES = [
  [320, 568, 2],
  [360, 780, 3],
  [375, 667, 2],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [414, 736, 3],
  [414, 896, 2],
  [414, 896, 3],
  [420, 912, 3],
  [428, 926, 3],
  [430, 932, 3],
  [440, 956, 3],
];
const IPADS = [
  [744, 1133, 2],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [834, 1210, 2],
  [1024, 1366, 2],
  [1032, 1376, 2],
];

describe("iOS launch images", () => {
  it("are linked: one per iPhone upright, two per iPad", () => {
    expect(links).toHaveLength(IPHONES.length + IPADS.length * 2);
  });

  it("each exist under brand/splash, and none is left unlinked", () => {
    expect(links.map(({ file }) => file).sort()).toEqual([...files].sort());
  });

  it("have no two media queries the same", () => {
    const queries = links.map(
      ({ across, down, ratio, orientation }) =>
        `${across}x${down}@${ratio} ${orientation}`,
    );
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("are as many pixels as the query's screen has", () => {
    for (const { file, across, down, ratio, orientation } of links) {
      const upright = { width: across * ratio, height: down * ratio };
      const expected =
        orientation === "landscape"
          ? { width: upright.height, height: upright.width }
          : upright;
      expect(jpegSize(file), file).toEqual(expected);
    }
  });

  it.each([
    ...IPHONES.map(([w, h, r]) => [w, h, r, "portrait"] as const),
    ...IPADS.flatMap(([w, h, r]) => [
      [w, h, r, "portrait"] as const,
      [w, h, r, "landscape"] as const,
    ]),
  ])(
    "serve the %ix%i screen at %ix, held %s, by exactly one",
    (w, h, r, held) => {
      const matching = links.filter(
        (link) =>
          link.across === w &&
          link.down === h &&
          link.ratio === r &&
          link.orientation === held,
      );
      expect(matching).toHaveLength(1);
    },
  );
});
