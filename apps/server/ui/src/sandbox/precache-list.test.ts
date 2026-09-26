import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { build, type Rolldown } from "vite";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function source(file: Rolldown.OutputChunk | Rolldown.OutputAsset): string {
  if (file.type === "chunk") return file.code;
  return typeof file.source === "string"
    ? file.source
    : new TextDecoder().decode(file.source);
}

describe("the views' build", () => {
  let files: Map<string, string>;
  let listed: string[];

  beforeAll(async () => {
    const output = (await build({
      root: ROOT,
      configFile: `${ROOT}/vite.config.ts`,
      logLevel: "silent",
      build: { write: false },
    })) as Rolldown.RolldownOutput;
    files = new Map(output.output.map((file) => [file.fileName, source(file)]));
    listed = JSON.parse(files.get("views/precache.json") ?? "null");
  }, 60_000);

  it("lists every file each view's page loads", () => {
    const pages = ["lesson", "passage", "practice"].map(
      (view) => files.get(`views/${view}.html`) ?? "",
    );
    const loaded = pages.flatMap((page) =>
      [...page.matchAll(/(?:src|href)="(\/views\/assets\/[^"]+)"/g)].map(
        ([, path]) => path,
      ),
    );

    expect(loaded.length).toBeGreaterThan(pages.length);
    expect(listed).toEqual(expect.arrayContaining(loaded));
  });

  it("lists every hashed file but the fonts' older formats", () => {
    const hashed = [...files.keys()]
      .filter((name) => name.startsWith("views/assets/"))
      .filter((name) => !/\.(woff|ttf)$/.test(name))
      .map((name) => `/${name}`)
      .sort();

    expect(hashed.some((name) => name.endsWith(".woff2"))).toBe(true);
    expect(hashed.some((name) => name.endsWith(".css"))).toBe(true);
    expect(listed).toEqual(hashed);
  });

  it("lists nothing that is not a hashed view file", () => {
    expect(listed.every((path) => path.startsWith("/views/assets/"))).toBe(
      true,
    );
    expect(listed.some((path) => /\.(woff|ttf|html)$/.test(path))).toBe(false);
  });
});
