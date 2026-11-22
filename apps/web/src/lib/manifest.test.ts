import { describe, expect, it } from "vitest";
import manifestSource from "../../public/manifest.webmanifest?raw";
import indexHtml from "../../index.html?raw";

interface Icon {
  src: string;
  sizes: string;
  purpose?: string;
}
const manifest = JSON.parse(manifestSource) as {
  start_url: string;
  scope: string;
  id: string;
  display: string;
  icons: Icon[];
  shortcuts: { url: string; icons: Icon[] }[];
};
const publicFiles = Object.keys(import.meta.glob("../../public/brand/*.png"));
const onDisk = (src: string) => publicFiles.includes(`../../public${src}`);

describe("the web app manifest", () => {
  it("installs as a standalone app that opens inside its scope", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url.startsWith("/app")).toBe(true);
    expect(manifest.id).toBe(manifest.start_url);
    expect(manifest.scope).toBe("/");
  });

  it("has 192 and 512 icons that exist, and a maskable one apart from the 'any' ones", () => {
    const sizes = manifest.icons
      .filter((i) => i.purpose === "any")
      .map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    const maskable = manifest.icons.filter((i) => i.purpose === "maskable");
    expect(maskable).toHaveLength(1);
    const anySources = manifest.icons
      .filter((i) => i.purpose === "any")
      .map((i) => i.src);
    expect(anySources).not.toContain(maskable[0].src);
    for (const icon of manifest.icons)
      expect(onDisk(icon.src), icon.src).toBe(true);
  });

  it("points its shortcuts at pages and icons that exist", () => {
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.url.startsWith("/app/")).toBe(true);
      for (const icon of shortcut.icons)
        expect(onDisk(icon.src), icon.src).toBe(true);
    }
  });
});

describe("the document's iOS install tags", () => {
  it("opens as an app, reaches the screen's edges, and has an icon iOS can use", () => {
    expect(indexHtml).toContain(
      'name="apple-mobile-web-app-capable" content="yes"',
    );
    expect(indexHtml).toContain("viewport-fit=cover");
    expect(indexHtml).toContain('rel="apple-touch-icon"');
    expect(onDisk("/brand/apple-touch-icon.png")).toBe(true);
  });
});
