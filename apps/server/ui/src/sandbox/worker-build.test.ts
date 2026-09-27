import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { build, type Rolldown } from "vite";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function bytes(file: Rolldown.OutputChunk | Rolldown.OutputAsset) {
  return file.type === "chunk" ? file.code : file.source;
}

describe("the sandbox worker's build", () => {
  let files: Map<string, string | Uint8Array>;
  let worker: string;
  let listed: Record<string, string>;

  beforeAll(async () => {
    const output = (await build({
      root: ROOT,
      configFile: `${ROOT}/vite.config.ts`,
      logLevel: "silent",
      build: { write: false },
    })) as Rolldown.RolldownOutput;
    files = new Map(output.output.map((file) => [file.fileName, bytes(file)]));
    worker = String(files.get("views/ui-sandbox-sw.js") ?? "");
    listed = JSON.parse(worker.match(/const FILES = (\{.*?\});/)?.[1] ?? "{}");
  }, 60_000);

  it("lists every file each view's page loads", () => {
    const pages = ["lesson", "passage", "practice"].map((view) =>
      String(files.get(`views/${view}.html`) ?? ""),
    );
    const loaded = pages.flatMap((page) =>
      [...page.matchAll(/(?:src|href)="(\/views\/assets\/[^"]+)"/g)].map(
        ([, path]) => path,
      ),
    );

    expect(loaded.length).toBeGreaterThan(pages.length);
    expect(Object.keys(listed)).toEqual(expect.arrayContaining(loaded));
  });

  it("gives each file the digest of the bytes written", () => {
    const hashed = [...files.keys()]
      .filter((name) => name.startsWith("views/assets/"))
      .filter((name) => !/\.(woff|ttf)$/.test(name));

    expect(hashed.some((name) => name.endsWith(".css"))).toBe(true);
    expect(hashed.some((name) => name.endsWith(".woff2"))).toBe(true);
    expect(Object.keys(listed).sort()).toEqual(
      hashed.map((name) => `/${name}`).sort(),
    );
    for (const name of hashed)
      expect(listed[`/${name}`]).toBe(
        createHash("sha256").update(files.get(name)!).digest("base64"),
      );
  });

  it("leaves the server's part of the worker for the server to write", () => {
    expect(worker).toContain("const SERVER = __SERVER__;");
    expect(worker).not.toContain("__FILES__");
  });
});
