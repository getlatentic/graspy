import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";

const files = Object.keys(
  import.meta.glob("../../public/brand/splash/*.{png,jpg}"),
);
const links = [
  ...indexHtml.matchAll(
    /<link rel="apple-touch-startup-image" href="([^"]+)" media="([^"]+)"/g,
  ),
].map(([, href, media]) => ({ href, media }));

const read = (media: string, name: string) =>
  media.match(new RegExp(`\\(${name}: ([\\w.]+?)(?:px)?\\)`))?.[1];

describe("iOS launch images", () => {
  it("are linked, one per screen", () => {
    expect(links.length).toBeGreaterThanOrEqual(20);
  });

  it("each exist under brand/splash, and none is left unlinked", () => {
    const linked = links.map(({ href }) => `../../public${href}`).sort();
    expect(linked).toEqual([...files].sort());
  });

  it("have a media query for each, with no two the same", () => {
    const pairs = links.map(({ media }) =>
      [
        read(media, "device-width"),
        read(media, "device-height"),
        read(media, "-webkit-device-pixel-ratio"),
        read(media, "orientation"),
      ].join("|"),
    );
    for (const pair of pairs) expect(pair, pair).not.toContain("undefined");
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("are named for the pixel size the media query asks for", () => {
    for (const { href, media } of links) {
      const ratio = Number(read(media, "-webkit-device-pixel-ratio"));
      const across = Number(read(media, "device-width")) * ratio;
      const down = Number(read(media, "device-height")) * ratio;
      // The media query gives the screen upright; a landscape image is turned on its side.
      const landscape = read(media, "orientation") === "landscape";
      expect(href).toBe(
        `/brand/splash/${landscape ? `${down}x${across}` : `${across}x${down}`}.jpg`,
      );
    }
  });
});
